package ir.azuraai.app

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Shader
import android.util.AttributeSet
import android.view.View
import android.view.animation.DecelerateInterpolator
import android.view.animation.LinearInterpolator
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/**
 * AzuraSplashView — the native launch animation for the Azura mark.
 *
 * The web app's own loading state can't cover the window before the WebView
 * exists, so without this the user stares at a flat colour while the page
 * boots. This view sits above the WebView and plays a short, self-contained
 * sequence built from the real logo asset:
 *
 *  1. **Reveal** — the mark wipes in left-to-right via a sweeping gradient
 *     mask, so it looks drawn rather than faded.
 *  2. **Overshoot** — it springs to slightly past full size and settles.
 *  3. **Shine** — a highlight sweeps across the mark on a loop, which reads
 *     as the mark "alive" while the network catches up.
 *  4. **Breathe** — a slow scale pulse keeps the screen alive during wait.
 *
 * Everything is drawn with a single Paint and a shader; there is no
 * dependency on AppCompat or Compose, so it adds nothing to build time or
 * method count beyond what the app already ships.
 */
class AzuraSplashView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private val bitmap = BitmapFactory.decodeResource(
        resources, R.drawable.azura_splash_384
    )

    /** Base paint for the coloured mark. */
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
    }

    /** Sweep highlight drawn with DST_IN so it only clips the mark. */
    private val maskPaint = Paint(Paint.ANTI_ALIAS_FLAG)

    private val matrix = Matrix()

    /** 0..1 progress of the left-to-right reveal. */
    private var reveal = 0f

    /** 0..1 spring progress, overshoots past 1. */
    private var pop = 0f

    /** 0..1 position of the looping shine sweep. */
    private var shine = 0f

    /** 0..1 breathing pulse. */
    private var breathe = 0f

    /** 0 = fully visible, 1 = gone. Used for the hand-off to the WebView. */
    private var fadeOut = 0f

    private var running = true

    private val revealAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
        duration = 900
        interpolator = DecelerateInterpolator(1.6f)
        addUpdateListener {
            reveal = it.animatedValue as Float
            invalidate()
        }
    }

    private val popAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
        duration = 1100
        interpolator = DecelerateInterpolator(0.9f)
        addUpdateListener {
            pop = it.animatedValue as Float
            invalidate()
        }
    }

    /** Loops forever; cheap because it only dirties a small rect. */
    private val loopAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
        duration = 2600
        repeatCount = ValueAnimator.INFINITE
        repeatMode = ValueAnimator.RESTART
        interpolator = LinearInterpolator()
        addUpdateListener {
            val t = it.animatedValue as Float
            shine = t
            // Two sine cycles offset so the shine and the breath never sync up.
            breathe = ((sin(t * 2 * Math.PI) + 1) / 2).toFloat()
            invalidate()
        }
    }

    init {
        setLayerType(LAYER_TYPE_HARDWARE, null)
        fillPaint.isFilterBitmap = true
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        if (running) start()
    }

    override fun onDetachedFromWindow() {
        stop()
        super.onDetachedFromWindow()
    }

    private fun start() {
        if (revealAnimator.isStarted || popAnimator.isStarted) return
        revealAnimator.start()
        popAnimator.start()
        loopAnimator.start()
    }

    private fun stop() {
        revealAnimator.cancel()
        popAnimator.cancel()
        loopAnimator.cancel()
        running = false
    }

    /**
     * Fades the splash out. [onFinished] runs once the overlay is invisible so
     * the caller can drop it from the hierarchy.
     */
    fun dismiss(onFinished: (() -> Unit)? = null) {
        if (fadeOut >= 1f) return
        stop()
        ValueAnimator.ofFloat(fadeOut, 1f).apply {
            duration = 320
            interpolator = DecelerateInterpolator()
            addUpdateListener {
                fadeOut = it.animatedValue as Float
                invalidate()
            }
            addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    visibility = GONE
                    onFinished?.invoke()
                }
            })
            start()
        }
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        android.util.Log.d("AzuraSplash", "size=${w}x$h")
    }

    override fun onDraw(canvas: Canvas) {
        val bmp = bitmap ?: return
        val cx = width / 2f
        val cy = height / 2f

        // Springs past 1.0 then settles, so the mark "lands".
        val spring = 1f + 0.14f * overshoot(pop)
        val pulse = 1f + 0.035f * breathe
        val size = min(width, height) * 0.34f * spring * pulse
        val halfW = size * (bmp.width.toFloat() / bmp.height)
        val halfH = size / 2f

        // Gentle counter-rotation: the figure-8 reads as alive without
        // becoming distracting over a multi-second wait.
        val tiltDeg = 0.045f * Math.sin((shine * 2.0 * Math.PI).toDouble()).toFloat()

        matrix.reset()
        matrix.postRotate(tiltDeg * 180f / Math.PI.toFloat(), cx, cy)
        matrix.postScale(halfW / bmp.width, halfH / bmp.height, cx, cy)
        matrix.postTranslate(cx - halfW, cy - halfH)
        fillPaint.shader = null
        fillPaint.alpha = (255 * (1f - fadeOut)).toInt().coerceIn(0, 255)
        canvas.drawBitmap(bmp, matrix, fillPaint)

        // ── Shine sweep ────────────────────────────────────────────────────
        // A narrow bright band travels across the mark, clipped to the mark
        // itself with DST_IN so it never bleeds onto the background.
        if (fadeOut < 1f && shine < 0.85f) {
            val travel = cx - halfW + (halfW * 2f) * shine
            val band = size * 0.22f
            val shader = LinearGradient(
                travel - band, 0f, travel + band, 0f,
                intArrayOf(
                    Color.TRANSPARENT,
                    Color.argb(150, 255, 255, 255),
                    Color.TRANSPARENT
                ),
                floatArrayOf(0f, 0.5f, 1f),
                Shader.TileMode.CLAMP
            )
            maskPaint.shader = shader
            maskPaint.xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_IN)

            canvas.save()
            canvas.concat(matrix)
            canvas.drawBitmap(bmp, 0f, 0f, maskPaint)
            canvas.restore()
            maskPaint.xfermode = null
            maskPaint.shader = null
        }

        // ── Reveal wipe ────────────────────────────────────────────────────
        // While revealing, clip the mark to the portion left of the wipe edge.
        if (reveal < 1f) {
            canvas.saveLayer(null, null)
            val edge = cx - halfW + halfW * 2f * reveal
            canvas.clipRect(0f, 0f, edge, height.toFloat())
            canvas.drawBitmap(bmp, matrix, fillPaint)
            canvas.restore()
        }
    }

    /** Eases in, overshoots to ~1.14 around 60%, then settles at 1. */
    private fun overshoot(t: Float): Float {
        if (t >= 1f) return 0f
        val c = 1.70158f * 1.1f
        val p = t - 1f
        return c * p * p * ((t - 1f) * p * 1.4f + p)
    }
}