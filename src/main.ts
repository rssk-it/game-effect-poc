import './style.css'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { CameraRig } from './camera/rig'
import { Stage } from './scene/stage'
import { Character } from './scene/character'
import { FxManager } from './fx/particles'
import { Hud } from './ui/hud'
import { getTimeScale } from './core/time'
import { placeCharacters, runBattleLoop } from './battle/sequence'
import type { World } from './world'

async function loadTexture(loader: THREE.TextureLoader, url: string): Promise<THREE.Texture> {
  const tex = await loader.loadAsync(url)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

async function boot(): Promise<void> {
  const frame = document.getElementById('frame')!
  const app = document.getElementById('app')!

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  app.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const rig = new CameraRig(16 / 9)

  // ---- テクスチャ一括ロード ----
  const loader = new THREE.TextureLoader()
  const [knightTex, mageTex, tankTex, bossTex, groundTex, backdropTex, magicCircleTex, slashTex] =
    await Promise.all([
      loadTexture(loader, '/assets/knight.png'),
      loadTexture(loader, '/assets/mage.png'),
      loadTexture(loader, '/assets/tank.png'),
      loadTexture(loader, '/assets/boss-enemy.png'),
      loadTexture(loader, '/assets/ground-tile.png'),
      loadTexture(loader, '/assets/bg-panorama.png'),
      loadTexture(loader, '/assets/magic-circle.png'),
      loadTexture(loader, '/assets/slash-arc.png'),
    ])

  // ---- シーン構築 ----
  const stage = new Stage(scene, { ground: groundTex, backdrop: backdropTex })

  const knight = new Character(knightTex, { height: 3.1 })
  const tank = new Character(tankTex, { height: 3.0 })
  const mage = new Character(mageTex, { height: 3.2, flipX: true })
  const boss = new Character(bossTex, { height: 5.4, flipX: true })
  const chars = { knight, tank, mage, boss }
  for (const c of Object.values(chars)) scene.add(c.root)

  const fx = new FxManager(scene)
  const hud = new Hud(rig.camera, [
    { name: 'KNIGHT', portrait: '/assets/knight.png' },
    { name: 'TANK', portrait: '/assets/tank.png' },
    { name: 'MAGE', portrait: '/assets/mage.png' },
  ])

  const world: World = { scene, rig, stage, fx, hud, chars, tex: { slash: slashTex, magicCircle: magicCircleTex } }
  placeCharacters(world)

  // ---- ポストプロセス ----
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, rig.camera))
  // threshold を上げてキャラの肌・ハイライトが白飛びしないようにする（発光はエフェクトの高輝度部のみ）
  const bloom = new UnrealBloomPass(new THREE.Vector2(1920, 1080), 0.55, 0.45, 0.88)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())

  // ---- リサイズ ----
  const resize = () => {
    const w = frame.clientWidth
    const h = frame.clientHeight
    renderer.setSize(w, h)
    composer.setSize(w, h)
    rig.setAspect(w / h)
  }
  new ResizeObserver(resize).observe(frame)
  resize()

  // ---- レンダーループ ----
  const clock = new THREE.Clock()
  const characters = Object.values(chars)
  renderer.setAnimationLoop(() => {
    const dtReal = Math.min(clock.getDelta(), 0.1)
    const dt = dtReal * getTimeScale()

    stage.update(dt)
    for (const c of characters) c.update(dt, rig.camera)
    fx.update(dt)
    rig.update(dtReal)

    composer.render()
  })

  void runBattleLoop(world)
}

void boot()
