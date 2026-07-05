/**
 * ワイヤーフレーム表示のグローバル状態。
 * meshfx / particles / impact など複数モジュールから参照するため、
 * 循環importを避けて最小の独立モジュールに置く。
 */
let enabled = false

export function _setWireframeFlag(v: boolean): void {
  enabled = v
}

/** ワイヤーフレーム表示中か（ONの間は発光マテリアルを描かない）。 */
export function isWireframeOn(): boolean {
  return enabled
}
