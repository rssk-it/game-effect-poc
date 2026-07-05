import * as THREE from 'three'
import gsap from 'gsap'
import { blobShadowTexture } from '../fx/textures'

let sharedShadowTex: THREE.Texture | null = null

export interface CharacterOptions {
  /** ワールド単位でのキャラの高さ */
  height: number
  /** 左右反転（絵の向きを合わせる） */
  flipX?: boolean
}

/**
 * Y軸ビルボードの2Dキャラ。
 * root(接地点) の下に 絵・加算フラッシュ用の複製・ブロブ影 を持つ。
 */
export class Character {
  readonly root = new THREE.Group()
  readonly mesh: THREE.Mesh
  private readonly flashMesh: THREE.Mesh
  private readonly material: THREE.MeshBasicMaterial
  private readonly flashMaterial: THREE.MeshBasicMaterial
  private readonly pivot = new THREE.Group()
  private breathePhase = Math.random() * Math.PI * 2
  private time = 0
  breathing = true

  constructor(texture: THREE.Texture, opts: CharacterOptions) {
    const img = texture.image as { width: number; height: number }
    const aspect = img.width / img.height
    const h = opts.height
    const w = h * aspect

    const geo = new THREE.PlaneGeometry(w, h)
    geo.translate(0, h / 2, 0) // 接地点をピボットに

    this.material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.02,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    })
    this.mesh = new THREE.Mesh(geo, this.material)
    if (opts.flipX) this.mesh.scale.x = -1

    // 被弾/発光フラッシュ用: 同じ絵を加算合成で重ねる
    this.flashMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    this.flashMesh = new THREE.Mesh(geo, this.flashMaterial)
    this.flashMesh.scale.copy(this.mesh.scale)
    this.flashMesh.renderOrder = 1

    if (!sharedShadowTex) sharedShadowTex = blobShadowTexture()
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.8, w * 0.36),
      new THREE.MeshBasicMaterial({
        map: sharedShadowTex,
        transparent: true,
        depthWrite: false,
      }),
    )
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = 0.02

    this.pivot.add(this.mesh, this.flashMesh)
    this.root.add(this.pivot, shadow)
  }

  /** Y軸のみカメラへ正対 + 呼吸アニメ。 */
  update(dt: number, camera: THREE.Camera): void {
    this.time += dt
    const dx = camera.position.x - this.root.position.x
    const dz = camera.position.z - this.root.position.z
    this.pivot.rotation.y = Math.atan2(dx, dz)

    if (this.breathing) {
      const s = 1 + Math.sin(this.time * 2.2 + this.breathePhase) * 0.012
      this.mesh.scale.y = s
      this.flashMesh.scale.y = s
    }
  }

  get position(): THREE.Vector3 {
    return this.root.position
  }

  /** 胸元あたりのワールド座標（エフェクト/ダメージ表示の基準点）。 */
  chest(offsetY = 0.55): THREE.Vector3 {
    const p = this.root.position.clone()
    const geo = this.mesh.geometry as THREE.PlaneGeometry
    p.y += geo.parameters.height * offsetY
    return p
  }

  /** 白フラッシュ（発光）。 */
  flashWhite(intensity = 0.9, duration = 0.35): void {
    gsap.killTweensOf(this.flashMaterial)
    this.flashMaterial.opacity = intensity
    gsap.to(this.flashMaterial, { opacity: 0, duration, ease: 'power2.out' })
  }

  /** 被弾の赤点滅。 */
  tintRed(duration = 0.3): void {
    gsap.killTweensOf(this.material.color)
    this.material.color.setRGB(1, 0.25, 0.25)
    gsap.to(this.material.color, { g: 1, b: 1, duration, ease: 'power1.out' })
  }

  /** 仰け反り: 進行方向 dir(+1/-1) と逆へ弾かれ、傾いて戻る。 */
  knockback(dir: number, dist = 0.6, duration = 0.45): void {
    const tl = gsap.timeline()
    tl.to(this.root.position, { x: `+=${dir * dist}`, duration: duration * 0.3, ease: 'power3.out' })
    tl.to(this.root.position, { x: `-=${dir * dist}`, duration: duration * 0.7, ease: 'power2.inOut' })
    gsap.timeline()
      .to(this.pivot.rotation, { z: -dir * 0.16, duration: duration * 0.25, ease: 'power3.out' })
      .to(this.pivot.rotation, { z: 0, duration: duration * 0.75, ease: 'elastic.out(1.2, 0.6)' })
  }

  /** その場ジャンプ（アクションの予備動作など）。 */
  hop(height = 0.5, duration = 0.3): gsap.core.Timeline {
    const tl = gsap.timeline()
    tl.to(this.root.position, { y: height, duration: duration * 0.5, ease: 'power2.out' })
    tl.to(this.root.position, { y: 0, duration: duration * 0.5, ease: 'power2.in' })
    return tl
  }

  /** リプレイ用に見た目の状態を初期化する（位置は呼び出し側で戻す）。 */
  reset(): void {
    gsap.killTweensOf(this.root.position)
    gsap.killTweensOf(this.pivot.rotation)
    gsap.killTweensOf(this.pivot.position)
    gsap.killTweensOf(this.material)
    gsap.killTweensOf(this.material.color)
    gsap.killTweensOf(this.flashMaterial)
    this.material.opacity = 1
    this.material.color.setRGB(1, 1, 1)
    this.flashMaterial.opacity = 0
    this.pivot.rotation.z = 0
    this.pivot.position.y = 0
    this.root.position.y = 0
    this.breathing = true
  }

  /** 撃破: 発光 → フェードアウト。 */
  dissolve(duration = 1.6): gsap.core.Timeline {
    this.breathing = false
    const tl = gsap.timeline()
    tl.to(this.flashMaterial, { opacity: 1, duration: duration * 0.2, ease: 'power2.in' }, 0)
    tl.to([this.material, this.flashMaterial], { opacity: 0, duration: duration * 0.8, ease: 'power1.in' }, duration * 0.2)
    tl.to(this.pivot.position, { y: 0.6, duration, ease: 'power1.out' }, 0)
    return tl
  }
}
