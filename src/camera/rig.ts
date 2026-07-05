import * as THREE from 'three'
import gsap from 'gsap'

export interface FocusOptions {
  /** 注視点からの水平距離 */
  distance?: number
  /** 方位角(度)。0 = +Z 側(正面)、90 = +X 側 */
  azimuth?: number
  /** カメラの高さ */
  height?: number
  /** 注視点の高さオフセット */
  lookHeight?: number
  duration?: number
  ease?: string
}

/**
 * カメラディレクター。
 * position / target を GSAP で補間し、シェイクと FOV パンチを合成する。
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera
  readonly position = new THREE.Vector3(-2, 4.5, 14)
  readonly target = new THREE.Vector3(-0.5, 2.2, 0)

  private shake = { amp: 0 }
  private shakeTime = 0
  private baseFov: number

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 300)
    this.baseFov = 42
    this.update(0)
  }

  update(dtReal: number): void {
    this.shakeTime += dtReal
    const t = this.shakeTime
    const a = this.shake.amp
    // 複数周波数の sin 合成でそれっぽい揺れに
    const ox = (Math.sin(t * 91) + Math.sin(t * 47) * 0.6) * a * 0.5
    const oy = (Math.sin(t * 83 + 1.7) + Math.sin(t * 59) * 0.6) * a * 0.5
    const oz = Math.sin(t * 71 + 0.9) * a * 0.25

    this.camera.position.set(this.position.x + ox, this.position.y + oy, this.position.z + oz)
    this.camera.lookAt(this.target.x + ox * 0.5, this.target.y + oy * 0.5, this.target.z)
  }

  /** 注視点+極座標指定の寄り/引き。 */
  focusOn(point: THREE.Vector3, opts: FocusOptions = {}): gsap.core.Timeline {
    const {
      distance = 8, azimuth = 0, height = 3,
      lookHeight = 2, duration = 1, ease = 'power2.inOut',
    } = opts
    const rad = (azimuth * Math.PI) / 180
    const px = point.x + Math.sin(rad) * distance
    const pz = point.z + Math.cos(rad) * distance

    const tl = gsap.timeline()
    tl.to(this.position, { x: px, y: height, z: pz, duration, ease }, 0)
    tl.to(this.target, { x: point.x, y: point.y + lookHeight, z: point.z, duration, ease }, 0)
    return tl
  }

  /** 位置と注視点を直接指定。 */
  moveTo(pos: THREE.Vector3, look: THREE.Vector3, duration = 1, ease = 'power2.inOut'): gsap.core.Timeline {
    const tl = gsap.timeline()
    tl.to(this.position, { x: pos.x, y: pos.y, z: pos.z, duration, ease }, 0)
    tl.to(this.target, { x: look.x, y: look.y, z: look.z, duration, ease }, 0)
    return tl
  }

  /** 減衰シェイク。strength は概ね 0.05(小)〜0.5(大)。 */
  doShake(strength: number, duration = 0.5): void {
    gsap.killTweensOf(this.shake)
    this.shake.amp = strength
    gsap.to(this.shake, { amp: 0, duration, ease: 'power2.out' })
  }

  /** 一瞬 FOV を広げて戻す衝撃表現。 */
  fovPunch(delta = 8, duration = 0.45): void {
    const cam = this.camera
    gsap.killTweensOf(cam, 'fov')
    cam.fov = this.baseFov + delta
    cam.updateProjectionMatrix()
    gsap.to(cam, {
      fov: this.baseFov,
      duration,
      ease: 'power3.out',
      onUpdate: () => cam.updateProjectionMatrix(),
    })
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
  }
}
