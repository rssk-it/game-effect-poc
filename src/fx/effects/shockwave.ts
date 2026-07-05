import * as THREE from 'three'
import gsap from 'gsap'
import type { FxAssets } from '../assets'
import { FxMaterial } from '../fxmaterial'
import { FxManager, ParticleBurst } from '../particles'
import { MeshFx } from '../meshfx'
import { glowTexture } from '../textures'
import { GroundCrack, type CrackKind } from './ground-crack'

/** 衝撃波の属性。属性ごとに専用メッシュ+専用テクスチャ+専用地割れを使う。 */
export type ShockElement = 'physical' | 'fire' | 'ice' | 'electric' | 'holy' | 'void'

interface ShockElementDef {
  geoKey: keyof FxAssets['geo']
  texKey: keyof FxAssets['tex']
  color: number
  dustColor: number
  crackKind: CrackKind
}

const SHOCK_ELEMENTS: Record<ShockElement, ShockElementDef> = {
  physical: { geoKey: 'shockwave', texKey: 'shockwaveRing', color: 0xbfe4ff, dustColor: 0x556080, crackKind: 'stone' },
  fire: { geoKey: 'flameRing', texKey: 'fireRing', color: 0xffb36a, dustColor: 0x8a3a10, crackKind: 'magma' },
  ice: { geoKey: 'iceRing', texKey: 'frostBurst', color: 0xd8f0ff, dustColor: 0x4a7898, crackKind: 'ice' },
  electric: { geoKey: 'sparkRing', texKey: 'electricRing', color: 0xcfe0ff, dustColor: 0x3a5288, crackKind: 'stone' },
  holy: { geoKey: 'holyRing', texKey: 'holyRing', color: 0xffe2a0, dustColor: 0x907030, crackKind: 'stone' },
  void: { geoKey: 'voidRing', texKey: 'voidRing', color: 0xc0a0ff, dustColor: 0x452878, crackKind: 'void' },
}

export interface ShockwaveOptions {
  /** 属性（メッシュ・テクスチャ・地割れの種類が切り替わる）。省略時 physical */
  element?: ShockElement
  maxScale?: number
  duration?: number
  color?: THREE.ColorRepresentation
  edgeColor?: THREE.ColorRepresentation
  /** 地割れデカールも同時に出す */
  crack?: boolean
}

/** 属性別リングメッシュが走る3D衝撃波。二段構成+フラッシュ+土煙。 */
export class Shockwave3D extends MeshFx {
  constructor(fx: FxManager, assets: FxAssets, pos: THREE.Vector3, o: ShockwaveOptions = {}) {
    super(fx)
    const def = SHOCK_ELEMENTS[o.element ?? 'physical']
    const { maxScale = 7.5, duration = 0.7, color = def.color, edgeColor = 0xffffff, crack = false } = o
    const ringGeo = assets.geo[def.geoKey]
    const ringTex = assets.tex[def.texKey]

    this.group.position.set(pos.x, 0.05, pos.z)
    this.start()

    // 1. 主リング（属性専用メッシュ+テクスチャ）
    const mat = new FxMaterial({
      map: ringTex,
      color,
      edgeColor,
      dissolveSoft: 0.22,
      radialFade: 0.72,
    })
    const ring = this.addMesh(ringGeo, mat, 6)
    ring.scale.setScalar(0.4)

    // 2. 追い波（白く薄いリングが少し遅れて速く走る）
    const chaserMat = new FxMaterial({
      map: ringTex,
      color: 0xffffff,
      dissolveSoft: 0.3,
      radialFade: 0.72,
      opacity: 0.8,
    })
    const chaser = this.addMesh(ringGeo, chaserMat, 6)
    chaser.scale.set(0.2, 0.1, 0.2)

    // 3. 中心の炸裂フラッシュ
    const flash = this.addGlowSprite(0xffffff, 0.8, 0.8, 1)
    flash.position.y = 0.4

    const tl = gsap.timeline({ onComplete: () => this.kill() })
    tl.to(ring.scale, { x: maxScale, z: maxScale, y: maxScale * 0.8, duration, ease: 'power3.out' }, 0)
    tl.to(mat, { dissolve: 1, duration: duration * 0.75, ease: 'power1.in' }, duration * 0.25)
    tl.to(chaser.scale, { x: maxScale * 0.72, z: maxScale * 0.72, y: maxScale * 0.25, duration: duration * 0.85, ease: 'power4.out' }, 0.07)
    tl.to(chaserMat, { dissolve: 1, duration: duration * 0.6, ease: 'power1.in' }, 0.25)
    tl.to(flash.scale, { x: maxScale * 0.55, y: maxScale * 0.4, duration: duration * 0.35, ease: 'power3.out' }, 0)
    tl.to(flash.material, { opacity: 0, duration: duration * 0.35, ease: 'power2.in' }, duration * 0.12)

    // 4. 外周へ弾ける土煙（属性色）
    fx.add(
      new ParticleBurst(fx.scene, {
        texture: glowTexture(),
        position: pos.clone().add(new THREE.Vector3(0, 0.25, 0)),
        count: 20,
        colorA: color,
        colorB: def.dustColor,
        size: 0.55,
        speed: [maxScale * 0.9, maxScale * 1.6],
        direction: new THREE.Vector3(0, 0.12, 0),
        spread: 0.95,
        gravity: 2.5,
        drag: 3.2,
        life: [0.25, 0.6],
      }),
    )

    if (crack) new GroundCrack(fx, assets, pos, { scale: maxScale * 0.75, kind: def.crackKind })
  }

  protected onUpdate(): void {}
}
