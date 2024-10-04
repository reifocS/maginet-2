import { ContextMenuItem, useContextMenu } from "use-context-menu";
import "use-context-menu/styles.css";
import "./ContextMenu.css";

interface ContextMenuProps {
  onRotateLeft: () => void;
  onRotateRight: () => void;
  children: React.ReactNode;
  onFlip: () => void;
  sendBackToDeck: () => void;
  sendBackToHand: () => void;
}

export default function ContextMenu({
  onRotateLeft,
  onRotateRight,
  children,
  onFlip,
  sendBackToDeck,
  sendBackToHand,
}: ContextMenuProps) {
  const { contextMenu, onContextMenu } = useContextMenu(
    <div className="custom-context-menu">
      <ContextMenuItem>
        <button onClick={onRotateLeft}>Rotate Left</button>
      </ContextMenuItem>
      <ContextMenuItem>
        <button onClick={onRotateRight}>Rotate Right</button>
      </ContextMenuItem>
      <ContextMenuItem>
        <button onClick={onFlip}>Flip</button>
      </ContextMenuItem>
      <ContextMenuItem>
        <button onClick={sendBackToDeck}>Send Back to Deck</button>
      </ContextMenuItem>
      <ContextMenuItem>
        <button onClick={sendBackToHand}>Send Back to Hand</button>
      </ContextMenuItem>
    </div>
  );

  return (
    <>
      <div onContextMenu={onContextMenu} tabIndex={0}>
        {children}
      </div>
      {contextMenu}
    </>
  );
}
