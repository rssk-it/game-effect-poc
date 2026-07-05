import './viewer.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import gsap from 'gsap'
import { getTimeScale, setTimeScale } from './core/time'
import { FxManager } from './fx/particles'
import { loadFxAssets, type FxAssets } from './fx/assets'
import {
  SlashTrail,
  FireVortex,
  Shockwave3D,
  GroundCrack,
  HolyPillar,
  LightMotes,
  RisingRings,
  FrostSpikes,
  LightningStrike,
  setFxWireframe,
} from './fx/rich'
import { hitSpark, glowPop } from './fx/impact'
import { fireBeam } from './fx/magic'
import { ParticleBurst } from './fx/particles'
import { glowTexture } from './fx/textures'

/** エフェクト単体確認用ビューア。ボタンで再生し、OrbitControls で全方位から確認する。 */

interface FxEntry {
  name: string
  en: string
  desc: string
  /** 再生間隔（自動リピート用・秒） */
  interval: number
  trigger: (fx: FxManager, assets: FxAssets) => void
}

const ORIGIN = new THREE.Vector3(0, 0, 0)
const CHEST = new THREE.Vector3(0, 1.9, 0)

/** 魔法陣テクスチャ（boot で読み込んでから使う） */
let magicCircleTex!: THREE.Texture

/**
 * 画面フラッシュとカメラシェイク。
 * エフェクト単体では出せない「画面全体のインパクト」を担う（boot で実体を割り当てる）。
 */
let screenFlash: (intensity?: number, duration?: number, color?: string) => void = () => {}
let cameraShake: (strength?: number, duration?: number) => void = () => {}

/** 色tint可能な足元の魔法陣。回転しながら出現し、時間経過で拡散消滅する。 */
function groundCircle(
  fx: FxManager,
  pos: THREE.Vector3,
  o: { color?: THREE.ColorRepresentation; scale?: number; duration?: number } = {},
): void {
  const { color = 0xffffff, scale = 4, duration = 2.4 } = o
  const mat = new THREE.MeshBasicMaterial({
    map: magicCircleTex,
    color,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(pos.x, 0.08, pos.z)
  mesh.scale.setScalar(scale * 0.2)
  mesh.renderOrder = 3
  fx.scene.add(mesh)

  const spin = { update: (dt: number) => ((mesh.rotation.z += dt * 1.1), mesh.parent !== null) }
  fx.add(spin)

  const tl = gsap.timeline({
    onComplete: () => {
      fx.scene.remove(mesh)
      mesh.geometry.dispose()
      mat.dispose()
    },
  })
  tl.to(mesh.scale, { x: scale, y: scale, z: scale, duration: 0.55, ease: 'back.out(1.5)' }, 0)
  tl.to(mat, { opacity: 1, duration: 0.35, ease: 'power2.out' }, 0)
  tl.to(mesh.scale, { x: scale * 1.4, y: scale * 1.4, z: scale * 1.4, duration: 0.5, ease: 'power2.in' }, duration - 0.5)
  tl.to(mat, { opacity: 0, duration: 0.5, ease: 'power2.in' }, duration - 0.5)
}

const ENTRIES: FxEntry[] = [
  {
    name: '剣戟斬撃',
    en: 'SLASH TRAIL',
    desc: 'Blender製の円錐帯メッシュを回転スイープ。ストリークテクスチャのUVスクロール + ノイズディゾルブで刃筋が減衰する。',
    interval: 1.6,
    trigger: (fx, assets) => {
      new SlashTrail(fx, assets, CHEST, { roll: 0.85, scale: 3.8 })
      hitSpark(fx, CHEST, 0x9ec8ff, 0.7)
      cameraShake(0.09, 0.2)
      gsap.delayedCall(0.22, () => {
        new SlashTrail(fx, assets, CHEST, { roll: -0.7, mirror: true, scale: 4.4, color: 0xcfe4ff })
        hitSpark(fx, CHEST, 0xbfe0ff, 0.9)
        cameraShake(0.14, 0.3)
      })
    },
  },
  {
    name: '炎の竜巻',
    en: 'FIRE VORTEX',
    desc: '逆回転する二重スパイラルメッシュ。火炎ノイズテクスチャが下向きにスクロールして上昇火流に見せる。火の粉と地割れ付き。',
    interval: 3.4,
    trigger: (fx, assets) => {
      new FireVortex(fx, assets, ORIGIN, { scale: 1.7 })
      new GroundCrack(fx, assets, ORIGIN, { scale: 6, duration: 2.6 })
      new Shockwave3D(fx, assets, ORIGIN, { maxScale: 5, color: 0xffa04d, duration: 0.55 })
      cameraShake(0.16, 0.5)
    },
  },
  {
    name: '大地衝撃波',
    en: 'SHOCKWAVE',
    desc: '外縁が盛り上がったリングメッシュが拡散。天面平面投影UVでラジアルバーストが歪まず流れる。地割れデカール同時発火。',
    interval: 2.2,
    trigger: (fx, assets) => {
      glowPop(fx.scene, new THREE.Vector3(0, 0.6, 0), 0xffffff, 1.8, 0.25)
      new Shockwave3D(fx, assets, ORIGIN, { maxScale: 8.5, crack: true })
      hitSpark(fx, new THREE.Vector3(0, 0.7, 0), 0xbfe0ff, 1.1)
      cameraShake(0.22, 0.45)
      screenFlash(0.18, 0.2)
    },
  },
  {
    name: '光の柱',
    en: 'HOLY PILLAR',
    desc: 'ラッパ状メッシュの二重光柱。エネルギーストリームが上方向へ流れ、収束パーティクルで召喚感を出す。回復・バフ演出向け。',
    interval: 3.2,
    trigger: (fx, assets) => {
      new HolyPillar(fx, assets, ORIGIN, { scale: 1.5 })
    },
  },
  {
    name: '虚空の渦',
    en: 'VOID VORTEX',
    desc: '竜巻メッシュの色替えバリアント。同一アセットからマテリアルパラメータだけで別スキルを量産できることの確認用。',
    interval: 3.4,
    trigger: (fx, assets) => {
      new FireVortex(fx, assets, ORIGIN, {
        scale: 1.6,
        color: 0x4a1cb8,
        innerColor: 0x8a4cff,
        edgeColor: 0xc9a6ff,
        embers: false,
        desaturate: 1,
      })
      new Shockwave3D(fx, assets, ORIGIN, { maxScale: 6, color: 0x9a6cff, duration: 0.6 })
    },
  },
  {
    name: '光の粒',
    en: 'LIGHT MOTES',
    desc: '足元からスタッガー付きで湧く光の粒。ゆらぎながら上昇し、明滅エンベロープで溶けるように消える。勝利・回復などの穏やかな演出向け。',
    interval: 3.4,
    trigger: (fx) => {
      new LightMotes(fx, ORIGIN, { count: 30, radius: 1.2, stagger: 1.3 })
    },
  },
  {
    name: '地割れ',
    en: 'GROUND CRACK',
    desc: 'image-gen製マグマ地割れテクスチャのデカール単体。エンベロープ×正弦波でマグマが脈動し、ノイズディゾルブで冷えて消える。',
    interval: 2.6,
    trigger: (fx, assets) => {
      new GroundCrack(fx, assets, ORIGIN, { scale: 7, duration: 2.2 })
    },
  },
  {
    name: '回復',
    en: 'HEAL',
    desc: '緑にtintした魔法陣 + 光の粒 + 胸元の柔らかいグロー。攻撃系と対照的な「包む」構成のサポート演出。',
    interval: 3.2,
    trigger: (fx) => {
      groundCircle(fx, ORIGIN, { color: 0xb8ffd4, scale: 3.8, duration: 2.4 })
      new LightMotes(fx, ORIGIN, {
        count: 34,
        radius: 1.0,
        colorA: 0xeafff0,
        colorB: 0x7dffb0,
        stagger: 1.2,
        riseSpeed: [0.5, 0.95],
      })
      gsap.delayedCall(0.5, () => glowPop(fx.scene, CHEST, 0x9dffc0, 2.4, 0.6))
    },
  },
  {
    name: '武勇強化',
    en: 'POWER UP',
    desc: '衝撃波リングメッシュが体に沿って昇りながら収束するバフオーラ。炎色の光の粒で熱気を足す。',
    interval: 2.8,
    trigger: (fx, assets) => {
      new RisingRings(fx, assets, ORIGIN, { count: 3, color: 0xffb54d })
      new LightMotes(fx, ORIGIN, {
        count: 20,
        radius: 0.8,
        colorA: 0xffe9b0,
        colorB: 0xff8a3d,
        stagger: 0.8,
        riseSpeed: [0.8, 1.4],
      })
      glowPop(fx.scene, CHEST, 0xffc86a, 2, 0.4)
    },
  },
  {
    name: '落雷',
    en: 'LIGHTNING',
    desc: '中点変位で手続き生成したジグザグ経路をチューブ2重で描く落雷。時間差3本 + 高周波明滅 + 着弾スパーク。',
    interval: 2.4,
    trigger: (fx, assets) => {
      new LightningStrike(fx, ORIGIN, { strikes: 3 })
      screenFlash(0.3, 0.15, '#cfe0ff')
      gsap.delayedCall(0.13, () => screenFlash(0.2, 0.12, '#cfe0ff'))
      gsap.delayedCall(0.26, () => {
        new Shockwave3D(fx, assets, ORIGIN, { maxScale: 5, color: 0x3f5e9e, duration: 0.45 })
        screenFlash(0.4, 0.25, '#e8f0ff')
        cameraShake(0.2, 0.35)
      })
    },
  },
  {
    name: '氷牙氷結',
    en: 'FROST SPIKES',
    desc: '六角錐の氷晶が時間差でせり上がり、冷気ミストを纏って砕け散る。energy-streamテクスチャを輝度化して氷の質感に転用。',
    interval: 3.0,
    trigger: (fx, assets) => {
      new FrostSpikes(fx, assets, ORIGIN, { count: 8 })
      new Shockwave3D(fx, assets, ORIGIN, { maxScale: 5, color: 0x9fdcff, duration: 0.6 })
      cameraShake(0.12, 0.3)
    },
  },
  {
    name: '天光審判',
    en: 'JUDGEMENT',
    desc: '必殺技級の複合演出。金の魔法陣 → 収束 → 天からの極太光条 + 光柱 + 衝撃波 + 地割れ → 光の粒の余韻、の4段構成。',
    interval: 5.0,
    trigger: (fx, assets) => {
      // 1. 発動陣と収束
      groundCircle(fx, ORIGIN, { color: 0xffe9b0, scale: 5.5, duration: 3.6 })
      fx.add(
        new ParticleBurst(fx.scene, {
          texture: glowTexture(),
          position: new THREE.Vector3(0, 2.5, 0),
          count: 40,
          colorA: 0xffffff,
          colorB: 0xffd27a,
          size: 0.26,
          speed: [2.5, 4],
          life: [0.5, 0.85],
          converge: true,
          radius: 3.5,
        }),
      )
      // 2. 天からの光条 + 光柱 + 衝撃
      gsap.delayedCall(0.85, () => {
        fireBeam(fx.scene, new THREE.Vector3(0, 9, 0), new THREE.Vector3(0, 0.3, 0), {
          coreColor: 0xffffff,
          outerColor: 0xffc86a,
          radius: 0.9,
          duration: 1.5,
        })
        new HolyPillar(fx, assets, ORIGIN, { scale: 1.35, duration: 2.0, gather: false })
        new Shockwave3D(fx, assets, ORIGIN, { maxScale: 9.5, color: 0xffd27a, crack: true })
        hitSpark(fx, new THREE.Vector3(0, 1, 0), 0xffe9b0, 1.4)
        screenFlash(0.65, 0.5, '#fff3d8')
        cameraShake(0.3, 0.9)
      })
      // 3. 余韻の光の粒
      gsap.delayedCall(2.5, () => {
        new LightMotes(fx, ORIGIN, { count: 26, radius: 1.4, colorA: 0xfff7d9, colorB: 0xffc86a, stagger: 0.9 })
      })
    },
  },
  {
    name: 'メテオ',
    en: 'METEOR',
    desc: '必殺技級の複合演出。火球が軌跡を引いて落下 → 着弾で白閃光 + 炎の渦 + 衝撃波 + 地割れ + 火の粉が炸裂する。',
    interval: 4.4,
    trigger: (fx, assets) => {
      // 火球（グロー2重スプライト）
      const ball = new THREE.Group()
      const outer = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture(),
          color: 0xff8a3d,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      )
      outer.scale.setScalar(2.2)
      const core = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture(),
          color: 0xfff3d0,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      )
      core.scale.setScalar(1.1)
      ball.add(outer, core)
      ball.position.set(5.5, 9.5, -3)
      fx.scene.add(ball)

      // 落下軌跡の火の粉
      for (let i = 0; i < 5; i++) {
        gsap.delayedCall(0.09 * i, () => {
          fx.add(
            new ParticleBurst(fx.scene, {
              texture: glowTexture(),
              position: ball.position.clone(),
              count: 8,
              colorA: 0xffc86a,
              colorB: 0xff5a1a,
              size: 0.5,
              speed: [0.4, 1.2],
              gravity: -0.5,
              drag: 1.5,
              life: [0.3, 0.7],
            }),
          )
        })
      }

      // 落下 → 着弾
      gsap.to(ball.position, {
        x: 0,
        y: 0.4,
        z: 0,
        duration: 0.55,
        ease: 'power2.in',
        onComplete: () => {
          fx.scene.remove(ball)
          outer.material.dispose()
          core.material.dispose()
          glowPop(fx.scene, new THREE.Vector3(0, 0.8, 0), 0xffffff, 6, 0.45)
          new FireVortex(fx, assets, ORIGIN, { scale: 1.5, duration: 1.8 })
          new Shockwave3D(fx, assets, ORIGIN, { maxScale: 10, color: 0xffa04d, duration: 0.8, crack: true })
          new GroundCrack(fx, assets, ORIGIN, { scale: 8, duration: 2.4 })
          hitSpark(fx, new THREE.Vector3(0, 0.8, 0), 0xffb45e, 2)
          screenFlash(0.55, 0.45, '#ffe8c8')
          cameraShake(0.38, 0.65)
        },
      })
    },
  },
]

async function boot(): Promise<void> {
  const canvas = document.getElementById('fx-canvas') as HTMLCanvasElement
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x06070c)
  scene.fog = new THREE.Fog(0x06070c, 18, 42)

  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100)
  camera.position.set(6.5, 4.2, 9)

  const controls = new OrbitControls(camera, canvas)
  controls.target.set(0, 1.6, 0)
  controls.enableDamping = true
  controls.maxPolarAngle = Math.PI * 0.52
  controls.minDistance = 3
  controls.maxDistance = 26

  // 床: 暗いディスク + グリッド
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(24, 48),
    new THREE.MeshBasicMaterial({ color: 0x0b0e18 }),
  )
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)
  const grid = new THREE.GridHelper(48, 48, 0x2a3558, 0x151b30)
  grid.position.y = 0.01
  scene.add(grid)

  // ダミーターゲット（当たり位置の目安になる柱）
  const dummy = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.45, 2.2, 6, 14),
    new THREE.MeshBasicMaterial({ color: 0x1b2340, wireframe: true, transparent: true, opacity: 0.4 }),
  )
  dummy.position.y = 1.55
  scene.add(dummy)

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1920, 1080), 0.9, 0.5, 0.55))
  composer.addPass(new OutputPass())

  // ---- 画面フラッシュ & カメラシェイク ----
  const flashEl = document.getElementById('screen-flash') as HTMLDivElement
  screenFlash = (intensity = 0.5, duration = 0.3, color = '#ffffff') => {
    flashEl.style.background = color
    gsap.fromTo(flashEl, { opacity: intensity }, { opacity: 0, duration, ease: 'power2.out', overwrite: true })
  }
  const shake = { amp: 0 }
  cameraShake = (strength = 0.25, duration = 0.4) => {
    shake.amp = Math.max(shake.amp, strength)
    gsap.to(shake, { amp: 0, duration, ease: 'power2.out', overwrite: true })
  }

  const fx = new FxManager(scene)
  const [assets, circleTex] = await Promise.all([
    loadFxAssets(),
    new THREE.TextureLoader().loadAsync('/assets/magic-circle.png'),
  ])
  circleTex.colorSpace = THREE.SRGBColorSpace
  magicCircleTex = circleTex

  // ---- UI 構築 ----
  const buttonsEl = document.getElementById('fx-buttons')!
  const descEl = document.getElementById('fx-desc')!
  const speedEl = document.getElementById('speed') as HTMLInputElement
  const speedLabel = document.getElementById('speed-label')!
  const loopEl = document.getElementById('loop') as HTMLInputElement
  const replayEl = document.getElementById('replay')!
  const wireframeEl = document.getElementById('wireframe') as HTMLInputElement

  let current: FxEntry | null = null
  let loopCall: gsap.core.Tween | null = null

  const play = (entry: FxEntry) => {
    current = entry
    descEl.textContent = entry.desc
    for (const b of buttonsEl.children) b.classList.toggle('active', (b as HTMLElement).dataset.en === entry.en)
    entry.trigger(fx, assets)
    loopCall?.kill()
    if (loopEl.checked) loopCall = gsap.delayedCall(entry.interval, () => play(entry))
  }

  for (const entry of ENTRIES) {
    const btn = document.createElement('button')
    btn.dataset.en = entry.en
    btn.innerHTML = `${entry.name}<span class="en">${entry.en}</span>`
    btn.addEventListener('click', () => play(entry))
    buttonsEl.appendChild(btn)
  }

  speedEl.addEventListener('input', () => {
    const v = Number(speedEl.value)
    setTimeScale(v)
    speedLabel.textContent = `${v.toFixed(2)}x`
  })
  loopEl.addEventListener('change', () => {
    if (!loopEl.checked) loopCall?.kill()
    else if (current) loopCall = gsap.delayedCall(current.interval, () => current && play(current))
  })
  replayEl.addEventListener('click', () => current && play(current))
  wireframeEl.addEventListener('change', () => setFxWireframe(wireframeEl.checked))

  // ---- リサイズ & ループ ----
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight)
    composer.setSize(innerWidth, innerHeight)
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
  }
  addEventListener('resize', resize)
  resize()

  const clock = new THREE.Clock()
  const preShake = new THREE.Vector3()
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1) * getTimeScale()
    fx.update(dt)
    controls.update()
    // シェイクはレンダ直前にオフセットし、直後に戻す（OrbitControlsの状態を汚さない）
    preShake.copy(camera.position)
    if (shake.amp > 0.001) {
      camera.position.x += (Math.random() - 0.5) * shake.amp
      camera.position.y += (Math.random() - 0.5) * shake.amp
      camera.position.z += (Math.random() - 0.5) * shake.amp
    }
    composer.render()
    camera.position.copy(preShake)
  })

  // 初期再生
  play(ENTRIES[0])
}

void boot()
