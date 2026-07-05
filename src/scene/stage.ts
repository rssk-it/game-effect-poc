import * as THREE from 'three'
import { glowTexture, smokeTexture } from '../fx/textures'

/** 地面・背景・霧・蛍などの舞台一式。 */
export class Stage {
  readonly group = new THREE.Group()
  private fireflies!: THREE.Points
  private fireflyBase!: Float32Array
  private fireflyPhase!: Float32Array
  private mists: THREE.Sprite[] = []
  private time = 0

  constructor(scene: THREE.Scene, textures: { ground: THREE.Texture; backdrop: THREE.Texture }) {
    scene.fog = new THREE.Fog(0x14122e, 24, 78)
    scene.background = new THREE.Color(0x05060e)

    this.buildGround(textures.ground)
    this.buildBackdrop(textures.backdrop)
    this.buildFireflies()
    this.buildMist()
    scene.add(this.group)
  }

  private buildGround(tex: THREE.Texture): void {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(18, 18)
    tex.colorSpace = THREE.SRGBColorSpace
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(140, 140),
      new THREE.MeshBasicMaterial({ map: tex, color: 0xb0bad8, fog: true }),
    )
    ground.rotation.x = -Math.PI / 2
    this.group.add(ground)

    // 中央を月明かりでほんのり明るく
    const light = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshBasicMaterial({
        map: glowTexture(),
        color: 0x25304f,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    light.rotation.x = -Math.PI / 2
    light.position.y = 0.03
    this.group.add(light)
  }

  private buildBackdrop(tex: THREE.Texture): void {
    tex.colorSpace = THREE.SRGBColorSpace
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(190, 106),
      new THREE.MeshBasicMaterial({ map: tex, fog: false }),
    )
    backdrop.position.set(0, 26, -62)
    this.group.add(backdrop)
  }

  private buildFireflies(): void {
    const N = 90
    this.fireflyBase = new Float32Array(N * 3)
    this.fireflyPhase = new Float32Array(N)
    const positions = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
      this.fireflyBase[i * 3 + 0] = (Math.random() - 0.5) * 46
      this.fireflyBase[i * 3 + 1] = 0.3 + Math.random() * 7
      this.fireflyBase[i * 3 + 2] = -18 + Math.random() * 30
      this.fireflyPhase[i] = Math.random() * Math.PI * 2
    }
    positions.set(this.fireflyBase)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const mat = new THREE.PointsMaterial({
      map: glowTexture(),
      color: 0x9fb4ff,
      size: 0.28,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    })
    this.fireflies = new THREE.Points(geo, mat)
    this.group.add(this.fireflies)
  }

  private buildMist(): void {
    const tex = smokeTexture()
    for (let i = 0; i < 10; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: tex,
          color: 0x8a96c8,
          transparent: true,
          opacity: 0.05 + Math.random() * 0.05,
          depthWrite: false,
        }),
      )
      sprite.scale.set(16 + Math.random() * 14, 5 + Math.random() * 3, 1)
      sprite.position.set((Math.random() - 0.5) * 50, 1 + Math.random() * 2, -14 + Math.random() * 22)
      this.mists.push(sprite)
      this.group.add(sprite)
    }
  }

  update(dt: number): void {
    this.time += dt
    const pos = this.fireflies.geometry.getAttribute('position') as THREE.BufferAttribute
    const arr = pos.array as Float32Array
    for (let i = 0; i < this.fireflyPhase.length; i++) {
      const p = this.fireflyPhase[i]
      const t = this.time
      arr[i * 3 + 0] = this.fireflyBase[i * 3 + 0] + Math.sin(t * 0.35 + p) * 1.6
      arr[i * 3 + 1] = this.fireflyBase[i * 3 + 1] + Math.sin(t * 0.55 + p * 2) * 0.9
      arr[i * 3 + 2] = this.fireflyBase[i * 3 + 2] + Math.cos(t * 0.28 + p) * 1.4
    }
    pos.needsUpdate = true

    for (let i = 0; i < this.mists.length; i++) {
      this.mists[i].position.x += Math.sin(this.time * 0.12 + i * 1.7) * dt * 0.35
    }
  }
}
