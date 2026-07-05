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
import { SlashTrail, FireVortex, Shockwave3D, GroundCrack, HolyPillar, LightMotes, setFxWireframe } from './fx/rich'
import { hitSpark, glowPop } from './fx/impact'

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

const ENTRIES: FxEntry[] = [
  {
    name: '剣戟斬撃',
    en: 'SLASH TRAIL',
    desc: 'Blender製の円錐帯メッシュを回転スイープ。ストリークテクスチャのUVスクロール + ノイズディゾルブで刃筋が減衰する。',
    interval: 1.6,
    trigger: (fx, assets) => {
      new SlashTrail(fx, assets, CHEST, { roll: 0.85, scale: 3.8 })
      hitSpark(fx, CHEST, 0x9ec8ff, 0.7)
      gsap.delayedCall(0.22, () => {
        new SlashTrail(fx, assets, CHEST, { roll: -0.7, mirror: true, scale: 4.4, color: 0xcfe4ff })
        hitSpark(fx, CHEST, 0xbfe0ff, 0.9)
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

  const fx = new FxManager(scene)
  const assets = await loadFxAssets()

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
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1) * getTimeScale()
    fx.update(dt)
    controls.update()
    composer.render()
  })

  // 初期再生
  play(ENTRIES[0])
}

void boot()
