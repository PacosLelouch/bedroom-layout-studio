export class RenderScheduler {
  private frame: number | null = null;
  private continuousReasons = new Set<string>();
  constructor(private readonly render: () => void) {}
  invalidate = () => {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(this.renderFrame);
  };
  beginContinuous(reason: string) { this.continuousReasons.add(reason); this.invalidate(); }
  endContinuous(reason: string) { this.continuousReasons.delete(reason); }
  private renderFrame = () => { this.frame = null; this.render(); if (this.continuousReasons.size) this.invalidate(); };
  dispose() { if (this.frame !== null) cancelAnimationFrame(this.frame); this.frame = null; this.continuousReasons.clear(); }
}
