import * as THREE from 'three'
import gsap from 'gsap'
import type { FxAssets } from '../assets'
import { FxMaterial } from '../fxmaterial'
import { FxManager, ParticleBurst } from '../particles'
import { MeshFx } from '../meshfx'
import { glowPop } from '../impact'
import { glowTexture, sparkTexture } from '../textures'
import { GroundCrack } from './ground-crack'

export interface FrostSpikesOptions {
  count?: number
  radius?: number
  color?: THREE.ColorRepresentation
  innerColor?: THREE.ColorRepresentation
  duration?: number
  maxHeight?: number
}

/** 地面から六角錐の氷晶がせり上がり、砕けるように消えるフロスト演出。 */
export class FrostSpikes extends MeshFx {
  constructor(fx: FxManager, assets: FxAssets, pos: THREE.Vector3, o: FrostSpikesOptions = {}) {
    super(fx)
    const { count = 7, radius = 1.0, color = 0x8fd4ff, innerColor = 0xe8f8ff, duration = 1.5, maxHeight = 1.9 } = o

    this.group.position.copy(pos)
    this.start()

    // 1. 六角錐の氷晶群（時間差でせり上がる）
    for (let i = 0; i < count; i++) {
      const h = maxHeight * (0.45 + Math.random() * 0.55)
      const r = h * (0.16 + Math.random() * 0.06)
      const geo = this.ownGeometry(new THREE.ConeGeometry(r, h, 6, 1))
      geo.translate(0, h / 2, 0) // 根本を原点に

      const mat = new FxMaterial({
        map: assets.tex.energyStream,
        color: Math.random() < 0.4 ? innerColor : color,
        edgeColor: 0xffffff,
        desaturate: 1,
        scroll: [0, -0.25],
        dissolveSoft: 0.22,
        fadeBottom: 0.12,
      })
      const mesh = this.addMesh(geo, mat, 7)

      // 中心から外へ傾けつつ環状に配置
      const ang = (i / count) * Math.PI * 2 + Math.random() * 0.5
      const dist = radius * (0.25 + Math.random() * 0.75)
      mesh.position.set(Math.cos(ang) * dist, 0, Math.sin(ang) * dist)
      mesh.rotation.set(
        Math.sin(ang) * 0.3 * (dist / radius),
        Math.random() * Math.PI,
        -Math.cos(ang) * 0.3 * (dist / radius),
      )
      mesh.scale.set(1, 0.02, 1)

      gsap.delayedCall(i * 0.055, () => {
        gsap.to(mesh.scale, { y: 1, duration: 0.28, ease: 'back.out(2.2)' })
      })
      gsap.delayedCall(duration - 0.45, () => {
        gsap.to(mat, { dissolve: 1, duration: 0.45, ease: 'power2.in' })
      })
    }

    // 2. 冷気のミスト
    fx.add(
      new ParticleBurst(fx.scene, {
        texture: glowTexture(),
        position: pos.clone().add(new THREE.Vector3(0, 0.3, 0)),
        count: 18,
        colorA: 0xbfe8ff,
        colorB: 0x6ab8e8,
        size: 0.8,
        speed: [0.6, 1.6],
        direction: new THREE.Vector3(0, 0.4, 0),
        spread: 0.8,
        gravity: -0.3,
        drag: 1.6,
        life: [0.8, 1.5],
      }),
    )
    // 3. 凍った地面（専用の氷裂テクスチャ）
    new GroundCrack(fx, assets, pos, { scale: radius * 3.6, duration: duration + 0.3, kind: 'ice' })
    // 4. 結晶表面のきらめき（ランダムな時間差で小さな光が瞬く）
    for (let i = 0; i < 4; i++) {
      gsap.delayedCall(0.35 + Math.random() * (duration - 0.9), () => {
        const at = pos
          .clone()
          .add(
            new THREE.Vector3(
              (Math.random() - 0.5) * radius * 1.6,
              0.5 + Math.random() * (maxHeight * 0.7),
              (Math.random() - 0.5) * radius * 1.6,
            ),
          )
        glowPop(fx.scene, at, 0xffffff, 0.7, 0.22)
      })
    }
    // 5. 砕け散る氷片
    gsap.delayedCall(duration - 0.4, () => {
      fx.add(
        new ParticleBurst(fx.scene, {
          texture: sparkTexture(),
          position: pos.clone().add(new THREE.Vector3(0, 0.8, 0)),
          count: 30,
          colorA: 0xffffff,
          colorB: 0x9fdcff,
          size: 0.22,
          speed: [2, 5],
          gravity: 6,
          drag: 1.2,
          life: [0.3, 0.7],
        }),
      )
    })

    gsap.delayedCall(duration + 0.1, () => this.kill())
  }

  protected onUpdate(): void {}
}
