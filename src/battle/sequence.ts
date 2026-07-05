import * as THREE from 'three'
import gsap from 'gsap'
import type { World } from '../world'
import { sleep, hitStop, setTimeScale } from '../core/time'
import {
  hitSpark,
  glowPop,
  dustPuff,
  RoarWave,
  MagicCircle,
  chargeParticles,
  fireBeam,
  SlashTrail,
  FrostSpikes,
  Shockwave3D,
  GroundCrack,
  HolyPillar,
  LightMotes,
  LightningStrike,
  RisingRings,
  ParticleBurst,
  glowTexture,
  sparkTexture,
} from '../fx'

/** 立ち位置（リプレイ時にここへ戻す） */
const HOME = {
  tank: new THREE.Vector3(-5.2, 0, -1.8),
  knight: new THREE.Vector3(-6.8, 0, 2.2),
  mage: new THREE.Vector3(-9.8, 0, 0.2),
  boss: new THREE.Vector3(7.2, 0, 0),
}

const DEFAULT_CAM_POS = new THREE.Vector3(-2.5, 4.3, 15.5)
const DEFAULT_CAM_LOOK = new THREE.Vector3(-0.8, 2.3, 0)

export function placeCharacters(world: World): void {
  world.chars.knight.position.copy(HOME.knight)
  world.chars.tank.position.copy(HOME.tank)
  world.chars.mage.position.copy(HOME.mage)
  world.chars.boss.position.copy(HOME.boss)
}

/** バトルを一周回し、終了後リプレイボタンで再帰的に繰り返す。 */
export async function runBattleLoop(world: World): Promise<void> {
  await runBattle(world)
  world.hud.showReplay(() => {
    resetBattle(world)
    void runBattleLoop(world)
  })
}

function resetBattle(world: World): void {
  const { chars, hud, rig } = world
  for (const c of Object.values(chars)) c.reset()
  placeCharacters(world)
  hud.resetHp()
  hud.setActing(null)
  hud.hidePlates()
  rig.position.copy(DEFAULT_CAM_POS)
  rig.target.copy(DEFAULT_CAM_LOOK)
  setTimeScale(1)
}

async function runBattle(world: World): Promise<void> {
  const t = (label: string) => console.log(`[battle] ${label} @ ${(performance.now() / 1000).toFixed(2)}s`)
  t('intro')
  await intro(world)
  t('knight-buff')
  await knightBuffTurn(world)
  t('tank-frost')
  await tankFrostTurn(world)
  t('mage-lightning')
  await mageLightningTurn(world)
  t('boss')
  await bossTurn(world)
  t('knight-slash')
  await knightSlashTurn(world)
  t('tank-shock')
  await tankShockTurn(world)
  t('mage-judgement')
  await mageJudgement(world)
  t('victory')
  await victory(world)
  t('done')
}

// ---------------------------------------------------------------- 開幕

async function intro(world: World): Promise<void> {
  const { rig, hud, chars } = world

  hud.letterbox(true, 0)
  // ボスの寄りから開始
  rig.position.set(HOME.boss.x - 2, 1.6, 7)
  rig.target.set(HOME.boss.x, 3.4, HOME.boss.z)
  await sleep(0.6)

  // ボスが吠える: 集中線 + 激しいシェイク + FOVパンチ
  chars.boss.flashWhite(0.5, 0.6)
  new RoarWave(world.fx, world.fxAssets, chars.boss.chest(0.6), { scale: 9 })
  hud.focusLines(1.0)
  rig.doShake(0.5, 0.9)
  rig.fovPunch(8, 0.55)
  await sleep(0.9)

  // パーティ全景へスイープ
  rig.moveTo(DEFAULT_CAM_POS, DEFAULT_CAM_LOOK, 2.2, 'power2.inOut')
  await sleep(1.4)
  // 黒帯が完全に消えてからタイトル・HUDを出す
  hud.letterbox(false)
  await sleep(0.55)
  await hud.showCenterTitle('BATTLE START', false, 0.9)
  hud.showPlates()
  await sleep(0.3)
}

// ---------------------------------------------------------------- 騎士: 武勇強化（バフ）

async function knightBuffTurn(world: World): Promise<void> {
  const { rig, hud, chars, fx, scene } = world
  const { knight } = chars

  hud.setActing(0)
  await hud.showTurnBanner("KNIGHT'S TURN")

  // 騎士に寄る
  rig.focusOn(knight.position, { distance: 5.5, azimuth: 18, height: 2.2, lookHeight: 1.6, duration: 0.7 })
  await sleep(0.75)
  hud.showSkillBanner('武勇強化', { sub: 'POWER UP' })
  await sleep(0.4)

  // ルーン帯が体に沿って昇り、炎色の光の粒が熱気を足す
  knight.flashWhite(0.5, 0.5)
  glowPop(scene, knight.chest(), 0xffc86a, 2.2, 0.4)
  new RisingRings(fx, world.fxAssets, knight.position, { count: 3, scale: 1.5, color: 0xffb54d })
  new LightMotes(fx, knight.position, {
    count: 20,
    radius: 0.8,
    colorA: 0xffe9b0,
    colorB: 0xff8a3d,
    stagger: 0.8,
    riseSpeed: [0.8, 1.4],
  })
  await sleep(0.7)
  knight.hop(0.4, 0.35)
  await sleep(1.0)

  // カメラを戻す
  rig.moveTo(DEFAULT_CAM_POS, DEFAULT_CAM_LOOK, 0.9)
  hud.setActing(null)
  await sleep(0.9)
}

// ---------------------------------------------------------------- 騎士: 剣戟斬撃

async function knightSlashTurn(world: World): Promise<void> {
  const { rig, hud, chars, fx, scene } = world
  const { knight, boss } = chars

  hud.setActing(0)
  await hud.showTurnBanner("KNIGHT'S TURN")

  // 騎士に寄る
  rig.focusOn(knight.position, { distance: 6, azimuth: 18, height: 2.4, lookHeight: 1.7, duration: 0.7 })
  await sleep(0.75)
  knight.flashWhite(0.5, 0.4)
  glowPop(scene, knight.chest(), 0x86b8ff, 2, 0.4)
  hud.showSkillBanner('剣戟斬撃', { sub: 'SLASH TRAIL' })
  await sleep(0.45)

  // ダッシュ → カメラはボス脇へ先回り
  await knight.hop(0.35, 0.24)
  dustPuff(fx, knight.position, -1, 1.2)
  const attackPos = HOME.boss.x - 3.4
  gsap.to(knight.root.position, { x: attackPos, duration: 0.34, ease: 'power2.in' })
  rig.focusOn(new THREE.Vector3(attackPos + 1.6, 0, 0), { distance: 7.5, azimuth: -14, height: 2.8, lookHeight: 2.4, duration: 0.42 })
  await sleep(0.42)
  dustPuff(fx, knight.position, 1, 1)

  // 3連斬撃（Blender製トレイルメッシュの回転スイープ）
  const hits = [
    { dmg: 1180, roll: 0.9, mirror: false, crit: false },
    { dmg: 1345, roll: -0.75, mirror: true, crit: false },
    { dmg: 2890, roll: 0.12, mirror: false, crit: true },
  ]
  for (const hit of hits) {
    const target = boss.chest(0.45)
    new SlashTrail(fx, world.fxAssets, target, {
      roll: hit.roll,
      mirror: hit.mirror,
      scale: hit.crit ? 5 : 3.6,
      color: hit.crit ? 0xcfe4ff : 0x9ed4ff,
    })
    hitSpark(fx, target, 0x9ec8ff, hit.crit ? 1.6 : 1)
    boss.tintRed(0.25)
    boss.knockback(1, hit.crit ? 0.5 : 0.25, 0.4)
    hud.damageBoss(hit.crit ? 0.09 : 0.05)
    hud.spawnDamage(boss.chest(0.7), hit.dmg, hit.crit ? 'crit' : '')
    rig.doShake(hit.crit ? 0.22 : 0.12, 0.4)
    hitStop(hit.crit ? 130 : 70)
    if (hit.crit) {
      // クリティカルは斬撃の追い打ち演出のみ（衝撃波はタンクの技と被るため出さない）
      knight.flashWhite(0.7, 0.3)
      new SlashTrail(fx, world.fxAssets, target, {
        roll: hit.roll + 1.4,
        mirror: !hit.mirror,
        scale: 5.6,
        color: 0xffffff,
        duration: 0.5,
      })
    }
    await sleep(0.34)
  }
  await sleep(0.35)

  // 帰還
  gsap.to(knight.root.position, { x: HOME.knight.x, duration: 0.5, ease: 'power2.inOut' })
  dustPuff(fx, knight.position, 1, 0.8)
  rig.moveTo(DEFAULT_CAM_POS, DEFAULT_CAM_LOOK, 0.9)
  hud.setActing(null)
  await sleep(0.9)
}

// ---------------------------------------------------------------- ボス

async function bossTurn(world: World): Promise<void> {
  const { rig, hud, chars, fx } = world
  const { boss } = chars
  const allies = [chars.knight, chars.tank, chars.mage]

  await hud.showTurnBanner('ENEMY TURN', true)

  // ローアングルでボスへ
  rig.focusOn(boss.position, { distance: 8, azimuth: -20, height: 1.1, lookHeight: 3.2, duration: 0.8 })
  await sleep(0.85)

  // 咆哮
  boss.flashWhite(0.6, 0.5)
  new RoarWave(fx, world.fxAssets, boss.chest(0.6), { scale: 11 })
  hud.showSkillBanner('滅殺の爪牙', { sub: 'SAVAGE CLEAVE' })
  rig.fovPunch(12, 0.55)
  rig.doShake(0.55, 1.0)
  const pulse = gsap.timeline()
  pulse.to(boss.mesh.scale, { x: boss.mesh.scale.x * 1.06, y: 1.06, duration: 0.18, ease: 'power2.out', yoyo: true, repeat: 1 })
  await sleep(1.0)

  // 突進 → パーティへ視点移動
  dustPuff(fx, boss.position, 1, 1.6)
  gsap.to(boss.root.position, { x: -2.8, duration: 0.42, ease: 'power3.in' })
  rig.moveTo(new THREE.Vector3(-4.5, 3.4, 11.5), new THREE.Vector3(-6, 2.2, 0), 0.5, 'power2.out')
  await sleep(0.48)
  dustPuff(fx, boss.position, -1, 1.6)

  // なぎ払い: 巨大な赤い斬撃が味方全員を打つ（味方の胸の高さに合わせて低めに配置）
  new SlashTrail(fx, world.fxAssets, new THREE.Vector3(-6.5, 0.9, 0.5), {
    roll: 0.3,
    mirror: true,
    scale: 8.5,
    color: 0xff5a3a,
    edgeColor: 0xffc9a0,
    duration: 0.55,
    desaturate: 1,
  })
  hud.flash(0.35, 0.3, '#ff2a1a')
  rig.doShake(0.4, 0.7)
  rig.fovPunch(6, 0.5)
  hitStop(110)
  const dmgs = [820, 645, 990]
  allies.forEach((ally, i) => {
    ally.tintRed(0.4)
    ally.knockback(-1, 0.7, 0.5)
    hitSpark(fx, ally.chest(0.5), 0xff8a70, 0.9)
    hud.damageAlly(i, [0.3, 0.22, 0.4][i])
    hud.spawnDamage(ally.chest(0.8), dmgs[i], 'ally')
  })
  await sleep(1.0)

  // ボス帰還
  gsap.to(boss.root.position, { x: HOME.boss.x, duration: 0.6, ease: 'power2.inOut' })
  rig.moveTo(DEFAULT_CAM_POS, DEFAULT_CAM_LOOK, 0.9)
  await sleep(0.95)
}

// ---------------------------------------------------------------- タンク: 氷牙氷結

async function tankFrostTurn(world: World): Promise<void> {
  const { rig, hud, chars, fx, scene } = world
  const { tank, boss } = chars

  hud.setActing(1)
  await hud.showTurnBanner("TANK'S TURN")

  rig.focusOn(tank.position, { distance: 6, azimuth: 22, height: 2.2, lookHeight: 1.7, duration: 0.7 })
  await sleep(0.75)
  tank.flashWhite(0.5, 0.4)
  glowPop(scene, tank.chest(), 0x9fdcff, 2.2, 0.45)
  hud.showSkillBanner('氷牙氷結', { sub: 'FROST FANG' })
  await sleep(0.5)

  // シールドチャージ: 地を這う突進
  dustPuff(fx, tank.position, -1, 1.4)
  const attackPos = HOME.boss.x - 3.2
  gsap.to(tank.root.position, { x: attackPos, duration: 0.4, ease: 'power3.in' })
  // カメラは突進を横から追う
  rig.moveTo(new THREE.Vector3(1.5, 2, 12), new THREE.Vector3(2.5, 2.4, 0), 0.45, 'power2.inOut')
  await sleep(0.44)

  // 氷牙氷結: ボスの足元から氷晶がせり上がり、氷の衝撃波が走る
  const target = boss.chest(0.4)
  glowPop(scene, target, 0xd8f0ff, 3.4, 0.3)
  hitSpark(fx, target, 0x9fdcff, 1.7)
  new FrostSpikes(fx, world.fxAssets, boss.position, { count: 9, radius: 1.4, maxHeight: 2.6 })
  new Shockwave3D(fx, world.fxAssets, boss.position, { element: 'ice', maxScale: 9, crack: true, duration: 0.75 })
  boss.tintRed(0.35)
  boss.knockback(1, 1.1, 0.6)
  hud.damageBoss(0.12)
  hud.spawnDamage(boss.chest(0.7), 3450, 'crit')
  rig.doShake(0.32, 0.6)
  rig.fovPunch(7, 0.45)
  hitStop(140)
  await sleep(0.9)

  // 帰還
  gsap.to(tank.root.position, { x: HOME.tank.x, duration: 0.5, ease: 'power2.inOut' })
  dustPuff(fx, tank.position, 1, 0.8)
  rig.moveTo(DEFAULT_CAM_POS, DEFAULT_CAM_LOOK, 0.9)
  hud.setActing(null)
  await sleep(0.9)
}

// ---------------------------------------------------------------- タンク: 大地衝撃波

async function tankShockTurn(world: World): Promise<void> {
  const { rig, hud, chars, fx, scene } = world
  const { tank, boss } = chars

  hud.setActing(1)
  await hud.showTurnBanner("TANK'S TURN")

  rig.focusOn(tank.position, { distance: 6, azimuth: 22, height: 2.2, lookHeight: 1.7, duration: 0.7 })
  await sleep(0.75)
  tank.flashWhite(0.5, 0.4)
  glowPop(scene, tank.chest(), 0xbfe4ff, 2.2, 0.45)
  hud.showSkillBanner('大地衝撃波', { sub: 'SHOCKWAVE' })
  await sleep(0.5)

  // シールドチャージ: 地を這う突進
  dustPuff(fx, tank.position, -1, 1.4)
  const attackPos = HOME.boss.x - 3.2
  gsap.to(tank.root.position, { x: attackPos, duration: 0.4, ease: 'power3.in' })
  rig.moveTo(new THREE.Vector3(1.5, 2, 12), new THREE.Vector3(2.5, 2.4, 0), 0.45, 'power2.inOut')
  await sleep(0.44)

  // 大地衝撃波: 地を打ち、二段の衝撃波と石破砕が走る
  const target = boss.chest(0.4)
  glowPop(scene, target, 0xffffff, 3.4, 0.3)
  hitSpark(fx, target, 0xbfe4ff, 1.7)
  new Shockwave3D(fx, world.fxAssets, boss.position, { maxScale: 11, crack: true, duration: 0.8 })
  boss.tintRed(0.35)
  boss.knockback(1, 1.1, 0.6)
  hud.damageBoss(0.12)
  hud.spawnDamage(boss.chest(0.7), 4820, 'crit')
  rig.doShake(0.34, 0.6)
  rig.fovPunch(7, 0.45)
  hitStop(140)
  await sleep(0.9)

  // 帰還
  gsap.to(tank.root.position, { x: HOME.tank.x, duration: 0.5, ease: 'power2.inOut' })
  dustPuff(fx, tank.position, 1, 0.8)
  rig.moveTo(DEFAULT_CAM_POS, DEFAULT_CAM_LOOK, 0.9)
  hud.setActing(null)
  await sleep(0.9)
}

// ---------------------------------------------------------------- 魔法使い: 落雷

async function mageLightningTurn(world: World): Promise<void> {
  const { rig, hud, chars, fx, scene } = world
  const { mage, boss } = chars

  hud.setActing(2)
  await hud.showTurnBanner("MAGE'S TURN")

  // 詠唱: メイジに寄る
  rig.focusOn(mage.position, { distance: 5.5, azimuth: 24, height: 2.2, lookHeight: 1.8, duration: 0.7 })
  await sleep(0.75)
  mage.flashWhite(0.4, 0.4)
  glowPop(scene, mage.chest(0.4), 0x9fc8ff, 2.2, 0.45)
  hud.showSkillBanner('落雷', { sub: 'LIGHTNING' })
  chargeParticles(fx, mage.chest(0.4), 0x9fc8ff)
  await sleep(0.8)

  // カメラをボスへカットして落雷
  rig.focusOn(boss.position, { distance: 9, azimuth: -18, height: 2.6, lookHeight: 3.0, duration: 0.35, ease: 'power2.out' })
  await sleep(0.4)

  new LightningStrike(fx, boss.position, { strikes: 3 })
  hud.flash(0.35, 0.2, '#cfe0ff')
  rig.doShake(0.3, 0.5)
  gsap.delayedCall(0.26, () => {
    new Shockwave3D(fx, world.fxAssets, boss.position, { element: 'electric', maxScale: 7, duration: 0.5 })
    hud.flash(0.3, 0.25, '#e8f0ff')
  })
  boss.tintRed(0.4)
  boss.knockback(1, 0.5, 0.5)
  hud.damageBoss(0.1)
  hud.spawnDamage(boss.chest(0.7), 2680, '')
  hitStop(100)
  await sleep(1.1)

  // カメラを戻す
  rig.moveTo(DEFAULT_CAM_POS, DEFAULT_CAM_LOOK, 0.9)
  hud.setActing(null)
  await sleep(0.9)
}

// ---------------------------------------------------------------- 魔法使い 必殺技: 天光審判

async function mageJudgement(world: World): Promise<void> {
  const { rig, hud, chars, fx, scene, tex } = world
  const { mage, boss } = chars

  hud.setActing(2)
  await hud.showTurnBanner("MAGE'S TURN")

  // 寄り + レターボックスで「来るぞ」感
  rig.focusOn(mage.position, { distance: 5.5, azimuth: 24, height: 2.2, lookHeight: 1.8, duration: 0.8 })
  hud.letterbox(true, 0.6)
  hud.hidePlates(0.4)
  await sleep(0.9)

  // カットイン
  await hud.playCutin()

  // 詠唱: 金の魔法陣 + 収束パーティクル + 金の詠唱光柱
  const circle = new MagicCircle(fx, tex.magicCircle, mage.position, 6, 0xffe2a0)
  circle.appear(0.7)
  hud.showSkillBanner('天光審判', { sub: 'JUDGEMENT', ultimate: true, hold: 1.6 })
  const chest = mage.chest(0.4) // 顔に光球が被らないよう胸元に
  chargeParticles(fx, chest, 0xffd27a)
  new HolyPillar(fx, world.fxAssets, mage.position, {
    scale: 1.25,
    duration: 2.6,
    gather: false,
  })
  mage.flashWhite(0.35, 0.5)

  // ゆっくり寄りながらチャージが極まる
  rig.focusOn(mage.position, { distance: 4.2, azimuth: -8, height: 1.6, lookHeight: 1.9, duration: 1.6, ease: 'power1.inOut' })
  await sleep(0.75)
  chargeParticles(fx, chest, 0xffd27a)
  glowPop(scene, chest, 0xffd27a, 2.6, 0.6)
  await sleep(0.75)

  // 両者を収めるワイドへカットし、ボスの足元に審判の陣を展開
  rig.position.set(-1.5, 3, 17)
  rig.target.set(-1.5, 2.6, 0)
  const bossCircle = new MagicCircle(fx, tex.magicCircle, boss.position, 7, 0xffe2a0)
  bossCircle.appear(0.5)
  await sleep(0.25)

  // スローモーションでタメ → 天からの裁き
  setTimeScale(0.3)
  glowPop(scene, chest, 0xffffff, 3.4, 0.5)
  await sleep(0.14)
  setTimeScale(1)

  hud.flash(0.95, 0.5, '#fff3d8')
  // 天からの極太光条がボスを貫く
  fireBeam(
    scene,
    new THREE.Vector3(boss.position.x, 11, boss.position.z),
    new THREE.Vector3(boss.position.x, 0.3, boss.position.z),
    { coreColor: 0xffffff, outerColor: 0xffc86a, radius: 1.0, duration: 1.7 },
  )
  new HolyPillar(fx, world.fxAssets, boss.position, { scale: 1.7, duration: 2.2, gather: false })
  new Shockwave3D(fx, world.fxAssets, boss.position, { element: 'holy', maxScale: 10, crack: true })
  rig.doShake(0.34, 1.6)
  boss.tintRed(1.4)

  // 発射を見せたらカメラをボスへパンし、連続ヒット〜撃破を正面で見せる
  rig.focusOn(boss.position, { distance: 9.5, azimuth: -20, height: 2.8, lookHeight: 2.8, duration: 1.0 })

  // 光条の連続ヒット
  for (let i = 0; i < 4; i++) {
    hitSpark(fx, boss.chest(0.35 + Math.random() * 0.3), 0xffe9b0, 1.3)
    hud.damageBoss(0.12)
    hud.spawnDamage(boss.chest(0.75), 9999 + Math.round(Math.random() * 4000), 'ultimate')
    await sleep(0.3)
  }

  // フィニッシュの一撃
  hud.flash(1, 0.7, '#fff3d8')
  glowPop(scene, boss.chest(0.5), 0xffffff, 8, 0.7)
  new Shockwave3D(fx, world.fxAssets, boss.position, { element: 'holy', maxScale: 13, crack: true, duration: 0.9 })
  new GroundCrack(fx, world.fxAssets, boss.position, { scale: 9, duration: 2.4, kind: 'stone', color: 0xffd9a0 })
  hud.damageBoss(1)
  hud.spawnDamage(boss.chest(0.9), 32768, 'ultimate')
  rig.fovPunch(10, 0.6)
  hitStop(160)
  circle.dismiss(0.7)
  bossCircle.dismiss(0.9)
  await sleep(0.5)

  // ボス崩壊をスローで見せる（金の光に還る）
  setTimeScale(0.4)
  rig.focusOn(boss.position, { distance: 8, azimuth: -18, height: 2.6, lookHeight: 2.6, duration: 0.6 })
  boss.dissolve(1.7)
  fx.add(
    new ParticleBurst(scene, {
      texture: glowTexture(),
      position: boss.chest(0.5),
      count: 90,
      colorA: 0xfff3c4,
      colorB: 0xffc23e,
      size: 0.42,
      speed: [1.5, 5],
      gravity: -1.6,
      drag: 1,
      life: [0.8, 2],
    }),
  )
  fx.add(
    new ParticleBurst(scene, {
      texture: sparkTexture(),
      position: boss.chest(0.4),
      count: 50,
      colorA: 0xffffff,
      colorB: 0xffd27a,
      size: 0.3,
      speed: [3, 9],
      gravity: 2,
      drag: 1.4,
      life: [0.5, 1.4],
    }),
  )
  await sleep(0.8)
  setTimeScale(1)
  hud.letterbox(false)
  hud.showPlates()
  hud.setActing(null)
  await sleep(0.6)
}

// ---------------------------------------------------------------- 勝利

async function victory(world: World): Promise<void> {
  const { rig, hud, chars, fx } = world

  // パーティの凱旋ショットへゆっくり引く
  rig.moveTo(new THREE.Vector3(-3, 3.2, 14), new THREE.Vector3(-7, 2.2, 0), 1.6, 'power2.inOut')
  await sleep(0.7)

  // 勝利: 光の粒がふわっと立ちのぼる控えめな演出
  for (const c of [chars.knight, chars.tank, chars.mage]) {
    c.flashWhite(0.35, 0.8)
    new LightMotes(fx, c.position, {
      count: 30,
      radius: 1.2,
      colorA: 0xfff7d9,
      colorB: 0xffc86a,
      stagger: 1.3,
    })
  }
  chars.knight.hop(0.5, 0.4)
  chars.tank.hop(0.4, 0.42)
  chars.mage.hop(0.55, 0.38)

  await hud.showCenterTitle('VICTORY', true, 1.6)
}
