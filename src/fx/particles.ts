import * as THREE from 'three'

/** update が false を返したら破棄される。 */
export interface Updatable {
  update(dt: number): boolean
}

/** シーン上のエフェクトの生成・更新・破棄を一元管理する。 */
export class FxManager {
  readonly scene: THREE.Scene
  private items: Updatable[] = []

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  add(item: Updatable): void {
    this.items.push(item)
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (!this.items[i].update(dt)) this.items.splice(i, 1)
    }
  }
}

export interface BurstOptions {
  texture: THREE.Texture
  position: THREE.Vector3
  count?: number
  colorA?: THREE.ColorRepresentation
  colorB?: THREE.ColorRepresentation
  /** 粒の大きさ */
  size?: number
  /** 初速の範囲 */
  speed?: [number, number]
  /** 射出方向（省略で全方位） */
  direction?: THREE.Vector3
  /** 方向のばらけ具合 0(直線)〜1(全方位) */
  spread?: number
  gravity?: number
  drag?: number
  /** 個々の粒の寿命範囲(秒) */
  life?: [number, number]
  /** true なら中心に収束（チャージ演出） */
  converge?: boolean
  /** 収束時の開始半径 */
  radius?: number
}

/** 汎用パーティクルバースト（加算合成の THREE.Points）。 */
export class ParticleBurst implements Updatable {
  private points: THREE.Points
  private velocities: Float32Array
  private lives: Float32Array
  private maxLives: Float32Array
  private material: THREE.PointsMaterial
  private opts: Required<Pick<BurstOptions, 'gravity' | 'drag' | 'converge'>> & { center: THREE.Vector3 }
  private scene: THREE.Scene
  private alive: number

  constructor(scene: THREE.Scene, o: BurstOptions) {
    const count = o.count ?? 24
    const [speedMin, speedMax] = o.speed ?? [2, 5]
    const [lifeMin, lifeMax] = o.life ?? [0.3, 0.7]
    const spread = o.spread ?? 1
    const radius = o.radius ?? 2.2

    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    this.velocities = new Float32Array(count * 3)
    this.lives = new Float32Array(count)
    this.maxLives = new Float32Array(count)

    const ca = new THREE.Color(o.colorA ?? 0xffffff)
    const cb = new THREE.Color(o.colorB ?? o.colorA ?? 0xffffff)
    const tmp = new THREE.Color()
    const dir = o.direction?.clone().normalize()

    for (let i = 0; i < count; i++) {
      // 射出方向: 基準方向と乱数方向を spread で混ぜる
      const rx = Math.random() * 2 - 1
      const ry = Math.random() * 2 - 1
      const rz = Math.random() * 2 - 1
      const len = Math.hypot(rx, ry, rz) || 1
      let vx = rx / len, vy = ry / len, vz = rz / len
      if (dir) {
        vx = dir.x * (1 - spread) + vx * spread
        vy = dir.y * (1 - spread) + vy * spread
        vz = dir.z * (1 - spread) + vz * spread
        const l2 = Math.hypot(vx, vy, vz) || 1
        vx /= l2; vy /= l2; vz /= l2
      }
      const speed = speedMin + Math.random() * (speedMax - speedMin)

      if (o.converge) {
        // 半径 radius の球面から中心へ向かう
        positions[i * 3 + 0] = o.position.x + vx * radius
        positions[i * 3 + 1] = o.position.y + vy * radius
        positions[i * 3 + 2] = o.position.z + vz * radius
        this.velocities[i * 3 + 0] = -vx * speed
        this.velocities[i * 3 + 1] = -vy * speed
        this.velocities[i * 3 + 2] = -vz * speed
      } else {
        positions[i * 3 + 0] = o.position.x
        positions[i * 3 + 1] = o.position.y
        positions[i * 3 + 2] = o.position.z
        this.velocities[i * 3 + 0] = vx * speed
        this.velocities[i * 3 + 1] = vy * speed
        this.velocities[i * 3 + 2] = vz * speed
      }

      const life = lifeMin + Math.random() * (lifeMax - lifeMin)
      this.lives[i] = life
      this.maxLives[i] = life

      tmp.lerpColors(ca, cb, Math.random())
      colors[i * 3 + 0] = tmp.r
      colors[i * 3 + 1] = tmp.g
      colors[i * 3 + 2] = tmp.b
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    this.material = new THREE.PointsMaterial({
      map: o.texture,
      size: o.size ?? 0.3,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    })

    this.points = new THREE.Points(geo, this.material)
    this.points.renderOrder = 5
    this.opts = { gravity: o.gravity ?? 0, drag: o.drag ?? 0, converge: o.converge ?? false, center: o.position.clone() }
    this.scene = scene
    this.alive = count
    scene.add(this.points)
  }

  update(dt: number): boolean {
    const pos = this.points.geometry.getAttribute('position') as THREE.BufferAttribute
    const arr = pos.array as Float32Array
    const dragMul = Math.max(0, 1 - this.opts.drag * dt)

    this.alive = 0
    for (let i = 0; i < this.lives.length; i++) {
      if (this.lives[i] <= 0) continue
      this.lives[i] -= dt
      if (this.lives[i] <= 0) {
        // 消えた粒は遠くへ退避
        arr[i * 3 + 1] = -9999
        continue
      }
      this.alive++
      this.velocities[i * 3 + 0] *= dragMul
      this.velocities[i * 3 + 1] = this.velocities[i * 3 + 1] * dragMul - this.opts.gravity * dt
      this.velocities[i * 3 + 2] *= dragMul
      arr[i * 3 + 0] += this.velocities[i * 3 + 0] * dt
      arr[i * 3 + 1] += this.velocities[i * 3 + 1] * dt
      arr[i * 3 + 2] += this.velocities[i * 3 + 2] * dt

      // 収束粒は中心を通過したら消す
      if (this.opts.converge) {
        const dx = arr[i * 3 + 0] - this.opts.center.x
        const dy = arr[i * 3 + 1] - this.opts.center.y
        const dz = arr[i * 3 + 2] - this.opts.center.z
        if (dx * dx + dy * dy + dz * dz < 0.05) this.lives[i] = 0
      }
    }
    pos.needsUpdate = true

    if (this.alive === 0) {
      this.scene.remove(this.points)
      this.points.geometry.dispose()
      this.material.dispose()
      return false
    }
    return true
  }
}
