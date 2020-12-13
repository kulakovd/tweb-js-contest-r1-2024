import { debounce } from "../helpers/schedulers";
import { logger, LogLevels } from "../lib/logger";
import VisibilityIntersector, { OnVisibilityChange } from "./visibilityIntersector";

type LazyLoadElementBase = {
  load: () => Promise<any>
};

type LazyLoadElement = Omit<LazyLoadElementBase, 'load'> & {
  load: (target?: HTMLElement) => Promise<any>,
  div: HTMLElement
  wasSeen?: boolean,
};

const PARALLEL_LIMIT = Infinity;

export class LazyLoadQueueBase {
  public queueId = 0;
  protected queue: Array<LazyLoadElementBase> = [];
  protected inProcess: Set<LazyLoadElementBase> = new Set();

  protected lockPromise: Promise<void> = null;
  protected unlockResolve: () => void = null;

  protected log = logger('LL', LogLevels.error);
  protected processQueue: () => void;

  constructor(protected parallelLimit = PARALLEL_LIMIT) {
    this.processQueue = debounce(() => this._processQueue(), 20, false, true);
  }

  public clear() {
    this.inProcess.clear(); // ацтеки забьются, будет плохо

    this.queue.length = 0;
    // unreachable code
    /* for(let item of this.inProcess) { 
      this.lazyLoadMedia.push(item);
    } */
  }

  public lock() {
    if(this.lockPromise) return;

    const perf = performance.now();
    this.lockPromise = new Promise((resolve, reject) => {
      this.unlockResolve = resolve;
    });

    this.lockPromise.then(() => {
      this.log('was locked for:', performance.now() - perf);
    });
  }

  public unlock() {
    if(!this.unlockResolve) return;

    this.unlockResolve();
    this.unlockResolve = this.lockPromise = null;

    this.processQueue();
  }

  protected async processItem(item: LazyLoadElementBase) {
    if(this.lockPromise) {
      return;
    }

    this.inProcess.add(item);

    this.log('will load media', this.lockPromise, item);

    try {
      //await new Promise((resolve) => setTimeout(resolve, 2e3));
      //await new Promise((resolve, reject) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
      //await item.load(item.div);
      await this.loadItem(item);
    } catch(err) {
      this.log.error('loadMediaQueue error:', err/* , item */);
    }

    this.inProcess.delete(item);

    this.log('loaded media', item);

    this.processQueue();
  }

  protected loadItem(item: LazyLoadElementBase) {
    return item.load();
  }

  protected getItem() {
    return this.queue.shift();
  }

  protected addElement(method: 'push' | 'unshift', el: LazyLoadElementBase) {
    this.queue[method](el);
    this.processQueue();
  }

  protected _processQueue(item?: LazyLoadElementBase) {
    if(!this.queue.length || this.lockPromise || (this.parallelLimit > 0 && this.inProcess.size >= this.parallelLimit)) return;

    do {
      if(item) {
        this.queue.findAndSplice(i => i == item);
      } else {
        item = this.getItem();
      }
  
      if(item) {
        this.processItem(item);
      } else {
        break;
      }

      item = null;
    } while(this.inProcess.size < this.parallelLimit && this.queue.length);
  }

  public push(el: LazyLoadElementBase) {
    this.addElement('push', el);
  }

  public unshift(el: LazyLoadElementBase) {
    this.addElement('unshift', el);
  }
}

export class LazyLoadQueueIntersector extends LazyLoadQueueBase {
  protected queue: Array<LazyLoadElement> = [];
  protected inProcess: Set<LazyLoadElement> = new Set();

  public intersector: VisibilityIntersector;
  protected intersectorTimeout: number;

  constructor(protected parallelLimit = PARALLEL_LIMIT) {
    super(parallelLimit);
  }

  public lock() {
    super.lock();
    this.intersector.lock();
  }

  public unlock() {
    super.unlock();
    this.intersector.unlock();
  }

  public unlockAndRefresh() {
    super.unlock();
    this.intersector.unlockAndRefresh();
  }

  public clear() {
    super.clear();
    this.intersector.disconnect();
  }

  public refresh() {
    this.intersector.refresh();
  }

  protected loadItem(item: LazyLoadElement) {
    return item.load(item.div);
  }

  protected addElement(method: 'push' | 'unshift', el: LazyLoadElement) {
    const item = this.queue.find(i => i.div == el.div);
    if(item) {
      return false;
    } else {
      for(const item of this.inProcess) {
        if(item.div == el.div) {
          return false;
        }
      }
    }

    this.queue[method](el);
    return true;
  }

  protected setProcessQueueTimeout() {
    if(!this.intersectorTimeout) {
      this.intersectorTimeout = window.setTimeout(() => {
        this.intersectorTimeout = 0;
        this.processQueue();
      }, 0);
    }
  }

  public push(el: LazyLoadElement) {
    super.push(el);
  }

  public unshift(el: LazyLoadElement) {
    super.unshift(el);
  }
}

export default class LazyLoadQueue extends LazyLoadQueueIntersector {
  constructor(protected parallelLimit = PARALLEL_LIMIT) {
    super(parallelLimit);

    this.intersector = new VisibilityIntersector(this.onVisibilityChange);
  }

  private onVisibilityChange = (target: HTMLElement, visible: boolean) => {
    if(visible) {
      this.log('isIntersecting', target);

      // need for set element first if scrolled
      const item = this.queue.findAndSplice(i => i.div == target);
      if(item) {
        item.wasSeen = true;
        this.queue.unshift(item);
        //this.processQueue(item);
      }

      this.setProcessQueueTimeout();
    }
  };

  protected getItem() {
    return this.queue.findAndSplice(item => item.wasSeen);
  }

  public async processItem(item: LazyLoadElement) {
    await super.processItem(item);
    this.intersector.unobserve(item.div);
  }

  protected addElement(method: 'push' | 'unshift', el: LazyLoadElement) {
    const inserted = super.addElement(method, el);

    if(!inserted) return false;

    this.intersector.observe(el.div);
    /* if(el.wasSeen) {
      this.processQueue(el);
    } else  */if(!el.hasOwnProperty('wasSeen')) {
      el.wasSeen = false;
    }
    
    return true;
  }
}

export class LazyLoadQueueRepeat extends LazyLoadQueueIntersector {
  private _queue: Map<HTMLElement, LazyLoadElement> = new Map();

  constructor(protected parallelLimit = PARALLEL_LIMIT, protected onVisibilityChange?: OnVisibilityChange) {
    super(parallelLimit);

    this.intersector = new VisibilityIntersector((target, visible) => {
      if(visible) {
        const item = this.queue.findAndSplice(i => i.div == target);
        this.queue.unshift(item || this._queue.get(target));
      } else {
        this.queue.findAndSplice(i => i.div == target);
      }
  
      this.onVisibilityChange && this.onVisibilityChange(target, visible);
      this.setProcessQueueTimeout();
    });
  }

  public clear() {
    super.clear();
    this._queue.clear();
  }

  /* public async processItem(item: LazyLoadElement) {
    //await super.processItem(item);
    await LazyLoadQueueBase.prototype.processItem.call(this, item);

    if(this.lazyLoadMedia.length) {
      this.processQueue();
    }
  } */

  public observe(el: LazyLoadElement) {
    this._queue.set(el.div, el);
    this.intersector.observe(el.div);
  }
}

export class LazyLoadQueueRepeat2 extends LazyLoadQueueIntersector {
  constructor(protected parallelLimit = PARALLEL_LIMIT, protected onVisibilityChange?: OnVisibilityChange) {
    super(parallelLimit);

    this.intersector = new VisibilityIntersector((target, visible) => {
      const item = this.queue.findAndSplice(i => i.div == target);
      if(visible && item) {
        this.queue.unshift(item);
      }
  
      this.onVisibilityChange && this.onVisibilityChange(target, visible);
      this.setProcessQueueTimeout();
    });
  }

  public observe(el: HTMLElement) {
    this.intersector.observe(el);
  }
}
