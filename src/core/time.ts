import gsap from 'gsap'

// タブが隠れて rAF が間引かれても GSAP 時間を実時間で進める
// （既定の lagSmoothing はスパイク時に 33ms しか進めず、演出が事実上停止する）
gsap.ticker.lagSmoothing(0)

/** グローバル時間倍率。three.js のループと GSAP の両方に効かせる。 */
let scale = 1

export function getTimeScale(): number {
  return scale
}

export function setTimeScale(s: number): void {
  scale = s
  gsap.globalTimeline.timeScale(s)
}

/**
 * ヒットストップ: 実時間 realMs の間だけ時間をほぼ止める。
 * 復帰は実時間 setTimeout（GSAP は止まっているため）。
 */
export function hitStop(realMs = 90, stopScale = 0.04): void {
  setTimeScale(stopScale)
  window.setTimeout(() => setTimeScale(1), realMs)
}

/** シーケンス用の待機。GSAP 経由なのでスローモーション中は実時間より長くなる。 */
export function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => gsap.delayedCall(seconds, resolve))
}
