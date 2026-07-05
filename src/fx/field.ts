import * as THREE from 'three'

export interface ParticleFieldOptions {
  count: number
  texture: THREE.Texture
  size: number
  renderOrder?: number
  /** 追加先（シーン直下 or エフェクトのグループ） */
  parent: THREE.Object3D
}

/**
 * CPU駆動パーティクル用の THREE.Points 配管をまとめた小さなユーティリティ。
 * 頂点/色バッファの確保・更新通知・破棄だけを担い、粒の運動則は呼び出し側が持つ
 * （LightMotes の浮遊、FireVortex の螺旋など、動きはエフェクト固有のため）。
 */
export class ParticleField {
  readonly points: THREE.Points
  readonly count: number
  private readonly posAttr: THREE.BufferAttribute
  private readonly colAttr: THREE.BufferAttribute
  private readonly geo: THREE.BufferGeometry
  private readonly mat: THREE.PointsMaterial
  private readonly parent: THREE.Object3D

  constructor(o: ParticleFieldOptions) {
    this.count = o.count
    const positions = new Float32Array(o.count * 3)
    const colors = new Float32Array(o.count * 3)
    for (let i = 0; i < o.count; i++) positions[i * 3 + 1] = -9999 // 出現前は画面外

    this.geo = new THREE.BufferGeometry()
    this.posAttr = new THREE.BufferAttribute(positions, 3)
    this.colAttr = new THREE.BufferAttribute(colors, 3)
    this.geo.setAttribute('position', this.posAttr)
    this.geo.setAttribute('color', this.colAttr)

    this.mat = new THREE.PointsMaterial({
      map: o.texture,
      size: o.size,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    })
    this.points = new THREE.Points(this.geo, this.mat)
    this.points.renderOrder = o.renderOrder ?? 6
    this.parent = o.parent
    this.parent.add(this.points)
  }

  /** 粒 i の位置と色（輝度込み）を書き込む。 */
  set(i: number, x: number, y: number, z: number, r: number, g: number, b: number): void {
    const p = this.posAttr.array as Float32Array
    const c = this.colAttr.array as Float32Array
    p[i * 3 + 0] = x
    p[i * 3 + 1] = y
    p[i * 3 + 2] = z
    c[i * 3 + 0] = r
    c[i * 3 + 1] = g
    c[i * 3 + 2] = b
  }

  /** 粒 i を非表示にする。 */
  hide(i: number): void {
    ;(this.posAttr.array as Float32Array)[i * 3 + 1] = -9999
    const c = this.colAttr.array as Float32Array
    c[i * 3 + 0] = c[i * 3 + 1] = c[i * 3 + 2] = 0
  }

  /** フレームの書き込み完了をGPUへ通知する。 */
  commit(): void {
    this.posAttr.needsUpdate = true
    this.colAttr.needsUpdate = true
  }

  dispose(): void {
    this.parent.remove(this.points)
    this.geo.dispose()
    this.mat.dispose()
  }
}
