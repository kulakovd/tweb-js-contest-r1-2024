export class ShineAnimationCanvas {
  public canvas: HTMLCanvasElement;

  private ctx: CanvasRenderingContext2D;

  private readonly border: number;
  private readonly borderRadius: number;
  private readonly gradientWidth: number;
  private readonly blur: number;
  private readonly animationDuration: number;
  private readonly innerShine?: boolean = true;
  private once?: boolean = false;

  private readonly insertPromise: Promise<void>;

  private start: number | undefined;

  private resolveInit: () => void;

  private animationFrameId: number | undefined;

  constructor(
    className: string,
    props : {
      border: number,
      borderRadius: number,
      gradientWidth: number,
      blur: number,
      animationDuration: number,
      innerShine?: boolean
    }
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.classList.add(className);
    this.ctx = this.canvas.getContext('2d')!;

    this.insertPromise = new Promise(resolve => {
      this.resolveInit = resolve;
    });

    Object.assign(this, props)
    this.observeCanvasInsertion();
    this.observeParentResize();
  }

  private observeCanvasInsertion() {
    requestAnimationFrame(() => {
      if(this.canvas.parentElement) {
        this.adjustCanvasSize();
      } else {
        this.observeCanvasInsertion();
      }
    });
  }

  private async observeParentResize() {
    await this.insertPromise;
    const parent = this.canvas.parentElement;
    if(parent) {
      const observer = new ResizeObserver(() => {
        this.adjustCanvasSize();
      });
      observer.observe(parent);
    }
  }

  private adjustCanvasSize() {
    const parent = this.canvas.parentElement;
    if(parent) {
      this.canvas.width = parent.clientWidth;
      this.canvas.height = parent.clientHeight;
      this.resolveInit();
    }
  }

  public async runOnce(delay: number = 0) {
    this.cancel();
    this.once = true;
    setTimeout(() => {
      this.run();
    }, delay);
  }

  public async runInfinite() {
    this.cancel();
    this.once = false;
    this.run();
  }

  public stop() {
    this.cancel();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private async run() {
    await this.insertPromise;
    this.animationFrameId = requestAnimationFrame(this.draw.bind(this));
  }

  private cancel() {
    cancelAnimationFrame(this.animationFrameId);
    this.start = undefined;
  }

  private fillRoundedRect(x: number, y: number, width: number, height: number, radius: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
  }

  private clearRoundedRect(x: number, y: number, width: number, height: number, radius: number) {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'destination-out';
    this.fillRoundedRect(x, y, width, height, radius);
    ctx.globalCompositeOperation = 'source-over';
  }

  private draw(timeStamp: number) {
    const {ctx, canvas} = this;

    if(this.start === undefined) {
      this.start = timeStamp;
    }

    if(this.once && timeStamp - this.start > this.animationDuration) {
      this.start = undefined;
      return;
    }

    const elapsed = (timeStamp - this.start) % this.animationDuration;
    const animationProgress = elapsed / this.animationDuration;

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    function clamp(min: number, max: number): (v: number) => number {
      return (v: number) => Math.max(min, Math.min(max, v));
    }

    const shineStart = clamp(0, canvas.width * 3)(((canvas.width * 2) - -canvas.width) * animationProgress) - canvas.width
    const innerGradientStart = clamp(this.border, canvas.height - this.border)(shineStart);
    const borderGradientStart = shineStart;

    const innerGradient = ctx.createLinearGradient(shineStart, 0, this.gradientWidth + shineStart, 0)
    innerGradient.addColorStop(0, 'rgba(255, 255, 255, 0)')
    innerGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.50)')
    innerGradient.addColorStop(1, 'rgba(255, 255, 255, 0.00)')

    const borderGradient = ctx.createLinearGradient(shineStart, 0, this.gradientWidth + shineStart, 0)
    borderGradient.addColorStop(0, 'rgba(255, 255, 255, 0)')
    borderGradient.addColorStop(0.5, 'rgba(255, 255, 255, 1.00)')
    borderGradient.addColorStop(1, 'rgba(255, 255, 255, 0.00)')

    ctx.filter = `blur(${this.blur}px)`

    ctx.fillStyle = borderGradient;
    ctx.fillRect(borderGradientStart, 0, this.gradientWidth, canvas.height)

    ctx.filter = 'none'
    ctx.fillStyle = 'white';
    this.clearRoundedRect(this.border, this.border, canvas.width - this.border * 2, canvas.height - this.border * 2, this.borderRadius);

    if(this.innerShine) {
      ctx.filter = `blur(${this.blur}px)`
      ctx.fillStyle = innerGradient;
      this.fillRoundedRect(innerGradientStart, this.border, this.gradientWidth, canvas.height - this.border * 2, this.borderRadius);
    }

    this.animationFrameId = requestAnimationFrame(this.draw.bind(this))
  }
}
