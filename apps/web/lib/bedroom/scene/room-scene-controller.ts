import type { RoomLayout, ViewMode } from "../types";

export interface RoomSceneControllerAdapter<TProps extends { room: RoomLayout; viewMode: ViewMode }> {
  applyProps(props: TProps): void;
  invalidate(): void;
  dispose(): void;
}

/** Public lifecycle boundary used by the React viewport bridge. */
export class RoomSceneController<TProps extends { room: RoomLayout; viewMode: ViewMode }> {
  private props: TProps | null = null;
  constructor(private readonly adapter: RoomSceneControllerAdapter<TProps>) {}
  applyProps(props: TProps) { this.props = props; this.adapter.applyProps(props); }
  showRoom(room: RoomLayout) { if (this.props) this.applyProps({ ...this.props, room }); }
  setViewMode(viewMode: ViewMode) { if (this.props) this.applyProps({ ...this.props, viewMode }); }
  setSelection(selectedId: string | null) { if (this.props && "selectedId" in this.props) this.applyProps({ ...this.props, selectedId } as TProps); }
  setCollisions(collisionIds: Set<string>) { if (this.props && "collisionIds" in this.props) this.applyProps({ ...this.props, collisionIds } as TProps); }
  invalidate() { this.adapter.invalidate(); }
  dispose() { this.props = null; this.adapter.dispose(); }
}
