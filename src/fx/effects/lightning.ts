import * as THREE from 'three'
import gsap from 'gsap'
import { FxManager, ParticleBurst, type Updatable } from '../particles'
import { glowPop } from '../impact'
import { glowTexture, sparkTexture } from '../textures'

export interface LightningStrikeOptions {
  color?: THREE.ColorRepresentation
  /** 稲妻の本数（時間差で走る） */
  strikes?: number
  height?: number
}

/**
 * 手続き生成の落雷。中点変位でジグザグ経路を作り、チューブ2重（白コア+色グロー）で描画。
 * 時間差で複数本走り、高周波の明滅を伴って消える。
 */
export class LightningStrike implements Updatable {
  private scene: THREE.Scene
  private group = new THREE.Group()
  private disposables: Array<THREE.BufferGeometry | THREE.Material> = []
  private t = 0
  private dead = false

  constructor(fx: FxManager, pos: THREE.Vector3, o: LightningStrikeOptions = {}) {
    const { color = 0x9fc8ff, strikes = 3, height = 8 } = o
    this.scene = fx.scene
    this.scene.add(this.group)
    fx.add(this)

    for (let s = 0; s < strikes; s++) {
      gsap.delayedCall(s * 0.13, () => {
        if (this.dead) return
        this.spawnBolt(fx, pos, height, color, s === strikes - 1)
      })
    }
    gsap.delayedCall(strikes * 0.13 + 0.55, () => {
      this.dead = true
    })
  }

  /** 加算合成チューブを稲妻経路に沿って張る。 */
  private addTube(curve: THREE.CatmullRomCurve3, segs: number, radius: number, color: THREE.ColorRepresentation, opacity: number): THREE.MeshBasicMaterial {
    const geo = new THREE.TubeGeometry(curve, segs, radius, 5)
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.renderOrder = 8
    this.group.add(mesh)
    this.disposables.push(geo, mat)
    return mat
  }

  private spawnBolt(
    fx: FxManager,
    pos: THREE.Vector3,
    height: number,
    color: THREE.ColorRepresentation,
    last: boolean,
  ): void {
    // 本流: 中点変位のジグザグ経路
    const top = new THREE.Vector3(
      pos.x + (Math.random() - 0.5) * 3,
      pos.y + height,
      pos.z + (Math.random() - 0.5) * 3,
    )
    const points: THREE.Vector3[] = []
    const segs = 9
    for (let i = 0; i <= segs; i++) {
      const v = i / segs
      const p = top.clone().lerp(pos, v)
      if (i > 0 && i < segs) {
        const wobble = 0.55 * Math.sin(Math.PI * v) + 0.15
        p.x += (Math.random() - 0.5) * 2 * wobble
        p.z += (Math.random() - 0.5) * 2 * wobble
      }
      points.push(p)
    }
    const curve = new THREE.CatmullRomCurve3(points)
    const coreMat = this.addTube(curve, 48, 0.035, 0xffffff, 1)
    const glowMat = this.addTube(curve, 48, 0.14, color, 0.55)
    gsap.to([coreMat, glowMat], { opacity: 0, duration: 0.38, ease: 'power2.in', delay: 0.08 })

    // 分岐（本流の中腹から短い枝が1〜2本逸れる）
    const branchCount = 1 + Math.floor(Math.random() * 2)
    for (let b = 0; b < branchCount; b++) {
      const from = points[2 + Math.floor(Math.random() * 4)].clone()
      const dir = new THREE.Vector3((Math.random() - 0.5) * 2, -0.6 - Math.random(), (Math.random() - 0.5) * 2)
        .normalize()
        .multiplyScalar(1.2 + Math.random() * 1.4)
      const bp: THREE.Vector3[] = [from]
      for (let i = 1; i <= 3; i++) {
        bp.push(
          from
            .clone()
            .addScaledVector(dir, i / 3)
            .add(new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.5)),
        )
      }
      const branchMat = this.addTube(new THREE.CatmullRomCurve3(bp), 16, 0.02, 0xffffff, 0.85)
      gsap.to(branchMat, { opacity: 0, duration: 0.25, ease: 'power2.in', delay: 0.05 })
    }

    // 発光: 雲側 + 着弾点 + 上空の面フラッシュ
    glowPop(this.scene, top, color, 2.5, 0.25)
    glowPop(this.scene, pos.clone().setY(pos.y + 0.3), 0xffffff, last ? 4 : 2.5, 0.3)
    glowPop(this.scene, top.clone().add(new THREE.Vector3(0, 1.5, 0)), 0x6f8fd8, 9, 0.3)

    if (last) {
      // 着弾スパーク
      fx.add(
        new ParticleBurst(this.scene, {
          texture: sparkTexture(),
          position: pos.clone().add(new THREE.Vector3(0, 0.4, 0)),
          count: 34,
          colorA: 0xffffff,
          colorB: color,
          size: 0.3,
          speed: [3, 9],
          gravity: 8,
          drag: 2,
          life: [0.2, 0.55],
        }),
      )
      // 帯電の名残（ゆっくり立ちのぼるイオン粒子）
      fx.add(
        new ParticleBurst(this.scene, {
          texture: glowTexture(),
          position: pos.clone().add(new THREE.Vector3(0, 0.6, 0)),
          count: 14,
          colorA: 0xbfd8ff,
          colorB: color,
          size: 0.24,
          speed: [0.5, 1.4],
          direction: new THREE.Vector3(0, 1, 0),
          spread: 0.5,
          gravity: -1.2,
          drag: 1,
          life: [0.6, 1.2],
        }),
      )
    }
  }

  update(dt: number): boolean {
    if (this.dead) {
      this.scene.remove(this.group)
      for (const d of this.disposables) d.dispose()
      return false
    }
    this.t += dt
    // 高周波の明滅（数フレームごとに一瞬消える）
    this.group.visible = Math.sin(this.t * 70) > -0.85
    return true
  }
}
