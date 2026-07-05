import * as THREE from 'three'
import gsap from 'gsap'

export interface AllyDef {
  name: string
  portrait: string
}

/** DOM オーバーレイの HUD・演出一式。 */
export class Hud {
  private camera: THREE.PerspectiveCamera

  private bossPlate: HTMLElement
  private bossFill: HTMLElement
  private bossGhost: HTMLElement
  private bossTip: HTMLElement
  private bossHp = 1

  private partyPlates: HTMLElement
  private allyEls: { plate: HTMLElement; fill: HTMLElement; ghost: HTMLElement; tip: HTMLElement }[] = []
  private allyHp: number[] = []

  private turnBanner: HTMLElement
  private skillBanner: HTMLElement
  private centerTitle: HTMLElement
  private flashEl: HTMLElement
  private letterboxTop: HTMLElement
  private letterboxBottom: HTMLElement
  private cutinEl: HTMLElement
  private damageLayer: HTMLElement
  private replayBtn: HTMLButtonElement

  constructor(camera: THREE.PerspectiveCamera, allies: AllyDef[]) {
    this.camera = camera
    const $ = (sel: string) => document.querySelector(sel) as HTMLElement
    this.bossPlate = $('#boss-plate')
    this.bossFill = $('.boss-hp-fill')
    this.bossGhost = $('.boss-hp-ghost')
    this.bossTip = $('.boss-hp .bar-tip')
    this.partyPlates = $('#party-plates')
    this.turnBanner = $('#turn-banner')
    this.skillBanner = $('#skill-banner')
    this.centerTitle = $('#center-title')
    this.flashEl = $('#flash')
    this.letterboxTop = $('#letterbox-top')
    this.letterboxBottom = $('#letterbox-bottom')
    this.cutinEl = $('#cutin')
    this.damageLayer = $('#damage-layer')
    this.replayBtn = $('#replay') as HTMLButtonElement

    for (const ally of allies) {
      const plate = document.createElement('div')
      plate.className = 'plate'
      plate.innerHTML = `
        <div class="plate-portrait" style="background-image:url('${ally.portrait}')"></div>
        <div class="plate-info">
          <div class="plate-name">${ally.name}</div>
          <div class="plate-hp">
            <div class="bar-track">
              <div class="bar-ghost plate-hp-ghost"></div>
              <div class="bar-fill plate-hp-fill"></div>
              <div class="bar-tip"></div>
              <div class="bar-shine"></div>
            </div>
          </div>
        </div>`
      this.partyPlates.appendChild(plate)
      this.allyEls.push({
        plate,
        fill: plate.querySelector('.plate-hp-fill') as HTMLElement,
        ghost: plate.querySelector('.plate-hp-ghost') as HTMLElement,
        tip: plate.querySelector('.bar-tip') as HTMLElement,
      })
      this.allyHp.push(1)
    }
  }

  /** 3D座標 → フレーム内 % 座標。 */
  private worldToScreen(v: THREE.Vector3): { x: number; y: number } {
    const p = v.clone().project(this.camera)
    return { x: (p.x * 0.5 + 0.5) * 100, y: (-p.y * 0.5 + 0.5) * 100 }
  }

  // ---------- HP ----------

  private animateBar(fill: HTMLElement, ghost: HTMLElement, tip: HTMLElement, value: number): void {
    const pct = `${value * 100}%`
    // 被弾の白フラッシュ → 本体が減り、ゴーストが遅れて追従
    gsap.fromTo(fill, { filter: 'brightness(2.6) saturate(0.4)' }, { filter: 'brightness(1) saturate(1)', duration: 0.45, ease: 'power2.out' })
    gsap.to(fill, { width: pct, duration: 0.25, ease: 'power2.out' })
    gsap.to(tip, { left: pct, duration: 0.25, ease: 'power2.out', opacity: value <= 0.002 ? 0 : 1 })
    gsap.to(ghost, { width: pct, duration: 0.5, delay: 0.55, ease: 'power2.inOut' })
  }

  damageBoss(fraction: number): void {
    this.bossHp = Math.max(0, this.bossHp - fraction)
    this.animateBar(this.bossFill, this.bossGhost, this.bossTip, this.bossHp)
  }

  damageAlly(index: number, fraction: number): void {
    this.allyHp[index] = Math.max(0.05, this.allyHp[index] - fraction)
    const el = this.allyEls[index]
    this.animateBar(el.fill, el.ghost, el.tip, this.allyHp[index])
  }

  resetHp(): void {
    this.bossHp = 1
    gsap.set([this.bossFill, this.bossGhost], { width: '100%' })
    gsap.set(this.bossTip, { left: '100%', opacity: 1 })
    this.allyHp = this.allyHp.map(() => 1)
    for (const el of this.allyEls) {
      gsap.set([el.fill, el.ghost], { width: '100%' })
      gsap.set(el.tip, { left: '100%', opacity: 1 })
    }
  }

  showPlates(): void {
    gsap.to(this.bossPlate, { opacity: 1, duration: 0.6 })
    gsap.to(this.partyPlates, { opacity: 1, duration: 0.6 })
  }

  /** シネマティック（黒帯）中はプレートを隠す。duration 0 で即時。 */
  hidePlates(duration = 0): void {
    gsap.killTweensOf([this.bossPlate, this.partyPlates])
    if (duration > 0) {
      gsap.to([this.bossPlate, this.partyPlates], { opacity: 0, duration })
    } else {
      gsap.set([this.bossPlate, this.partyPlates], { opacity: 0 })
    }
  }

  setActing(index: number | null): void {
    this.allyEls.forEach((el, i) => el.plate.classList.toggle('acting', i === index))
  }

  // ---------- バナー/タイトル ----------

  showTurnBanner(text: string, enemy = false): Promise<void> {
    const span = this.turnBanner.querySelector('span')!
    span.textContent = text
    this.turnBanner.classList.toggle('enemy', enemy)
    return new Promise((resolve) => {
      gsap.timeline({ onComplete: resolve })
        .to(this.turnBanner, { x: '0%', duration: 0.32, ease: 'power3.out', onStart: () => {
          gsap.set(this.turnBanner, { x: '-105%' })
        } })
        .to(this.turnBanner, { x: '-105%', duration: 0.3, ease: 'power2.in' }, '+=0.9')
    })
  }

  showSkillBanner(main: string, opts: { sub?: string; ultimate?: boolean; hold?: number } = {}): void {
    const { sub = '', ultimate = false, hold = 1.1 } = opts
    ;(this.skillBanner.querySelector('.skill-main') as HTMLElement).textContent = main
    ;(this.skillBanner.querySelector('.skill-sub') as HTMLElement).textContent = sub
    this.skillBanner.classList.toggle('ultimate', ultimate)
    gsap.timeline()
      .set(this.skillBanner, { scaleX: 0, opacity: 1 })
      .to(this.skillBanner, { scaleX: 1, duration: 0.22, ease: 'power4.out' })
      .to(this.skillBanner, { opacity: 0, duration: 0.35, ease: 'power1.in' }, `+=${hold}`)
  }

  showCenterTitle(text: string, victory = false, hold = 1.2): Promise<void> {
    this.centerTitle.textContent = text
    this.centerTitle.classList.toggle('victory', victory)
    return new Promise((resolve) => {
      gsap.timeline({ onComplete: resolve })
        .fromTo(
          this.centerTitle,
          { opacity: 0, scale: 1.8 },
          { opacity: 1, scale: 1, duration: 0.4, ease: 'power3.out' },
        )
        .to(this.centerTitle, { opacity: 0, scale: 0.92, duration: 0.4, ease: 'power2.in' }, `+=${hold}`)
    })
  }

  // ---------- 画面演出 ----------

  flash(opacity = 0.9, duration = 0.4, color = '#fff'): void {
    this.flashEl.style.background = color
    gsap.killTweensOf(this.flashEl)
    gsap.set(this.flashEl, { opacity })
    gsap.to(this.flashEl, { opacity: 0, duration, ease: 'power2.out' })
  }

  letterbox(show: boolean, duration = 0.45): void {
    gsap.to(this.letterboxTop, { y: show ? '0%' : '-101%', duration, ease: 'power3.out' })
    gsap.to(this.letterboxBottom, { y: show ? '0%' : '101%', duration, ease: 'power3.out' })
  }

  /**
   * 漫画的な集中線オーバーレイ。画面端から中心へ向かう三角ウェッジ群を
   * 一定間隔で引き直してフリッカーさせ、duration 秒でフェードアウトする。
   */
  focusLines(duration = 0.9): void {
    const frame = document.getElementById('frame')!
    const canvas = document.createElement('canvas')
    canvas.className = 'focus-lines'
    frame.appendChild(canvas)
    const ctx = canvas.getContext('2d')!

    const draw = () => {
      const w = (canvas.width = frame.clientWidth)
      const h = (canvas.height = frame.clientHeight)
      ctx.clearRect(0, 0, w, h)
      const cx = w / 2
      const cy = h / 2
      const maxR = Math.hypot(cx, cy) * 1.05
      const inner = Math.min(w, h) * 0.24
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      for (let i = 0; i < 70; i++) {
        const ang = Math.random() * Math.PI * 2
        const halfW = 0.004 + Math.random() * 0.011 // 角度半幅（先端ほど細い楔）
        const rIn = inner * (0.85 + Math.random() * 0.55)
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(ang - halfW) * maxR, cy + Math.sin(ang - halfW) * maxR)
        ctx.lineTo(cx + Math.cos(ang) * rIn, cy + Math.sin(ang) * rIn)
        ctx.lineTo(cx + Math.cos(ang + halfW) * maxR, cy + Math.sin(ang + halfW) * maxR)
        ctx.closePath()
        ctx.fill()
      }
    }
    draw()
    const flicker = window.setInterval(draw, 90)
    gsap.fromTo(
      canvas,
      { opacity: 0.85 },
      {
        opacity: 0,
        duration,
        ease: 'power2.in',
        onComplete: () => {
          window.clearInterval(flicker)
          canvas.remove()
        },
      },
    )
  }

  /** 必殺技カットイン。帯が開き、絵が横切る。 */
  playCutin(): Promise<void> {
    const band = this.cutinEl.querySelector('.cutin-band') as HTMLElement
    const art = this.cutinEl.querySelector('.cutin-art') as HTMLElement
    this.cutinEl.style.visibility = 'visible'
    this.cutinEl.classList.add('active')
    return new Promise((resolve) => {
      gsap.timeline({
        onComplete: () => {
          this.cutinEl.classList.remove('active')
          this.cutinEl.style.visibility = 'hidden'
          resolve()
        },
      })
        .set(art, { x: '130%', opacity: 1 })
        .to(band, { scaleX: 1, duration: 0.18, ease: 'power4.out' })
        // 勢いよく入る → 中央でゆっくりスライド → 抜ける
        .to(art, { x: '15%', duration: 0.22, ease: 'power4.out' }, 0.08)
        .to(art, { x: '0%', duration: 0.85, ease: 'none' })
        .to(art, { x: '-40%', opacity: 0, duration: 0.25, ease: 'power3.in' })
        .to(band, { scaleX: 0, duration: 0.2, ease: 'power3.in' }, '<')
    })
  }

  // ---------- ダメージ数字 ----------

  spawnDamage(worldPos: THREE.Vector3, amount: number | string, cls: '' | 'crit' | 'ally' | 'ultimate' = ''): void {
    const { x, y } = this.worldToScreen(worldPos)
    const el = document.createElement('div')
    el.className = `dmg ${cls}`
    el.textContent = String(amount)
    el.style.left = `${x + (Math.random() - 0.5) * 4}%`
    el.style.top = `${y + (Math.random() - 0.5) * 4}%`
    this.damageLayer.appendChild(el)
    gsap.timeline({ onComplete: () => el.remove() })
      .fromTo(el, { scale: 2.1, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.16, ease: 'power3.out' })
      .to(el, { y: '-=55', duration: 0.75, ease: 'power1.out' }, 0.1)
      .to(el, { opacity: 0, duration: 0.3, ease: 'power1.in' }, 0.55)
  }

  // ---------- リプレイ ----------

  showReplay(onClick: () => void): void {
    this.replayBtn.style.display = 'block'
    gsap.fromTo(this.replayBtn, { opacity: 0 }, { opacity: 1, duration: 0.5 })
    this.replayBtn.onclick = () => {
      this.replayBtn.style.display = 'none'
      onClick()
    }
  }
}
