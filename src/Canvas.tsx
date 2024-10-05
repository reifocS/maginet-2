import * as React from "react";
import { Shape as ShapeComponent } from "./Shape";
import "./Canvas.css";
import { screenToCanvas, sub } from "./utils/vec";
import Hand from "./Hand";
import ContextMenu from "./ContextMenu";
import useCards from "./hooks/useCards";
import { useEffect } from "react";
import { usePeerStore } from "./hooks/usePeerConnection";
import useModal from "./hooks/useModal";
import toast from "react-hot-toast";
import { Form, useLocation } from "react-router-dom";
import "./Modal.css";
import { generateId } from "./utils/math";
import { useCardReducer } from "./hooks/useCardReducer";

export interface Point {
  x: number;
  y: number;
}

export interface Card {
  id: string;
  src: string;
}

export interface Camera {
  x: number;
  y: number;
  z: number;
}

export interface Shape {
  id: string;
  point: number[];
  size: number[];
  type: ShapeType;
  text?: string;
  src?: string;
  rotation?: number;
  isFlipped?: boolean;
  fontSize?: number;
}

type ShapeType = "rectangle" | "circle" | "arrow" | "text" | "image";

function panCamera(camera: Camera, dx: number, dy: number): Camera {
  return {
    x: camera.x - dx / camera.z,
    y: camera.y - dy / camera.z,
    z: camera.z,
  };
}

function zoomCamera(camera: Camera, point: Point, dz: number): Camera {
  const zoom = camera.z - dz * camera.z;

  const p1 = screenToCanvas(point, camera);
  const p2 = screenToCanvas(point, { ...camera, z: zoom });

  return {
    x: camera.x + (p2.x - p1.x),
    y: camera.y + (p2.y - p1.y),
    z: zoom,
  };
}

export type Mode = "select" | "create";

function rotateShape(shape: Shape, angle: number): Shape {
  return {
    ...shape,
    rotation: (shape.rotation || 0) + angle,
  };
}

const DEFAULT_DECK = [
  "3 Ambitious Farmhand",
  "4 Reckoner Bankbuster",
  "2 Elspeth Resplendent",
  "2 March of Otherworldly Light",
  "4 The Restoration of Eiganjo",
  "4 Roadside Reliquary",
  "1 Eiganjo, Seat of the Empire",
  "16 Plains",
  "4 Ossification",
  "4 Wedding Announcement",
  "2 Destroy Evil",
  "4 The Wandering Emperor",
  "4 Lay Down Arms",
  "3 The Eternal Wanderer",
  "3 Mirrex",
  "3 Depopulate",
  "2 Fateful Absence",
  "3 Farewell",
  "4 Sunset Revelry",
  "3 Loran of the Third Path",
];

function processRawText(fromArena: string) {
  if (fromArena.trim() === "") return [];
  return fromArena.split("\n").flatMap((s) => {
    const match = s.match(/^(\d+)\s+(.*?)(?:\s*\/\/.*)?$/);
    if (match) {
      const [, count, name] = match;
      return Array(Number(count)).fill(name.trim());
    }
    return [];
  });
}

export default function Canvas() {
  const initPeer = usePeerStore((state) => state.initPeer);
  const disconnect = usePeerStore((state) => state.disconnect);
  const sendMessage = usePeerStore((state) => state.sendMessage);
  const onMessage = usePeerStore((state) => state.onMessage);

  const ref = React.useRef<SVGSVGElement>(null);
  const rDragging = React.useRef<{
    shape: Shape;
    origin: number[];
  } | null>(null);
  const [shapes, setShapes] = React.useState<Shape[]>([]);
  const [shapeInCreation, setShapeInCreation] = React.useState<{
    shape: Shape;
    origin: number[];
  } | null>(null);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const [mode, setMode] = React.useState<Mode>("select");
  const [shapeType, setShapeType] = React.useState<ShapeType>("text");
  const [selectedShapeIds, setSelectedShapeIds] = React.useState<string[]>([]);
  const [receivedData, setReceivedData] = React.useState<Shape[]>([]);
  const [editingText, setEditingText] = React.useState<{
    id: string;
    text: string;
  } | null>(null);

  const [selectionRect, setSelectionRect] = React.useState<{
    start: Point;
    end: Point;
  } | null>(null);

  const [hoveredCard, setHoveredCard] = React.useState<string | null>(null);
  const [isCommandPressed, setIsCommandPressed] = React.useState(false);
  const [cardState, dispatch] = useCardReducer({
    cards: [],
    deck: [],
  });

  const { cards } = cardState;

  // Update the functions that interact with cards and deck
  const drawCard = () => {
    dispatch({ type: "DRAW_CARD" });
  };

  const mulligan = () => {
    dispatch({ type: "MULLIGAN" });
  };

  const sendBackToHand = () => {
    const selectedCards = shapes.filter((shape) =>
      selectedShapeIds.includes(shape.id)
    ) as Card[];
    dispatch({ type: "SEND_TO_HAND", payload: selectedCards });
    setShapes((prevShapes) =>
      prevShapes.filter((shape) => !selectedShapeIds.includes(shape.id))
    );
    setSelectedShapeIds([]);
  };

  const sendBackToDeck = () => {
    const selectedCards = shapes.filter((shape) =>
      selectedShapeIds.includes(shape.id)
    ) as Card[];
    dispatch({ type: "SEND_TO_DECK", payload: selectedCards });
    setShapes((prevShapes) =>
      prevShapes.filter((shape) => !selectedShapeIds.includes(shape.id))
    );
    setSelectedShapeIds([]);
  };

  const handleDrop = (e: React.DragEvent<SVGElement>) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData("text/plain");
    const { x, y } = screenToCanvas({ x: e.clientX, y: e.clientY }, camera);
    const card = cardState.cards.find((card) => card.id === cardId);
    if (!card) return;
    dispatch({ type: "REMOVE_FROM_HAND", payload: [cardId] });

    setShapes((prevShapes) => [
      ...prevShapes,
      {
        id: generateId(),
        point: [x, y],
        size: [100, 100],
        type: "image",
        src: card.src,
        rotation: 0,
      },
    ]);
  };
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const d = params.get("deck");

  const { data } = useCards(
    Array.from(processRawText(d || DEFAULT_DECK.join("\n")))
  );

  useEffect(() => {
    if (data) {
      const initialDeck: Card[] = data
        .filter((card) => card.image_uris?.normal)
        .map((card) => ({
          id: card.id,
          src: card.image_uris.normal,
        }));
      dispatch({ type: "INITIALIZE_DECK", payload: initialDeck });
    }
  }, [data, dispatch]);

  useEffect(() => {
    initPeer();
    return () => {
      disconnect();
    };
  }, [initPeer, disconnect]);

  // send shapes to peer
  useEffect(() => {
    sendMessage({ type: "shapes", payload: shapes });
  }, [shapes, sendMessage]);

  useEffect(() => {
    const unsubscribeShapes = onMessage("shapes", (message) => {
      setReceivedData(message.payload);
    });

    const unsubscribeConnected = onMessage("connected", (message) => {
      toast(`Peer connected: ${message.payload.peerId}`);
    });

    return () => {
      unsubscribeShapes();
      unsubscribeConnected();
    };
  }, [onMessage]);

  useEffect(() => {
    function handleWheel(event: WheelEvent) {
      event.preventDefault();

      const { clientX, clientY, deltaX, deltaY, ctrlKey } = event;

      if (ctrlKey) {
        setCamera((camera) =>
          zoomCamera(camera, { x: clientX, y: clientY }, deltaY / 100)
        );
      } else {
        setCamera((camera) => panCamera(camera, deltaX, deltaY));
      }
    }

    const elm = ref.current;
    if (!elm) return;

    elm.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      elm.removeEventListener("wheel", handleWheel);
    };
  }, [ref]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Meta") {
        setIsCommandPressed(true);
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.key === "Meta") {
        setIsCommandPressed(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  function flipShape(shape: Shape): Shape {
    return {
      ...shape,
      isFlipped: !shape.isFlipped,
    };
  }

  function onFlip() {
    if (mode === "select" && selectedShapeIds.length > 0) {
      setShapes((prevShapes) =>
        prevShapes.map((shape) =>
          selectedShapeIds.includes(shape.id) ? flipShape(shape) : shape
        )
      );
    }
  }

  function onPointerDownCanvas(e: React.PointerEvent<SVGElement>) {
    const { x, y } = screenToCanvas({ x: e.clientX, y: e.clientY }, camera);
    const point = [x, y];
    if (mode === "create") {
      e.currentTarget.setPointerCapture(e.pointerId);
      if (shapeType === "text") {
        const id = generateId();
        setShapes((prevShapes) => [
          ...prevShapes,
          {
            id,
            point,
            size: [0, 0], // Initial size, will be updated when text is entered
            type: "text",
            text: "",
          },
        ]);
        setEditingText({ id, text: "" });
        setTimeout(() => {
          inputRef.current?.focus();
        }, 0);
      } else {
        setShapeInCreation({
          shape: {
            id: generateId(),
            point,
            size: [0, 0],
            type: shapeType,
          },
          origin: point,
        });
      }
      return;
    } else if (mode === "select" && !rDragging.current) {
      setSelectionRect({
        start: { x, y },
        end: { x, y },
      });
    }
  }

  function onPointerMoveCanvas(e: React.PointerEvent<SVGElement>) {
    const { x, y } = screenToCanvas({ x: e.clientX, y: e.clientY }, camera);

    if (mode === "create" && shapeInCreation) {
      const point = [x, y];
      const localShapeInCreation = {
        ...shapeInCreation,
        shape: { ...shapeInCreation.shape },
      };
      const delta = sub(point, shapeInCreation.origin);

      setShapeInCreation({
        ...localShapeInCreation,
        shape: {
          ...localShapeInCreation.shape,
          size: delta,
        },
      });
      return;
    } else if (mode === "select" && selectionRect) {
      setSelectionRect({
        ...selectionRect,
        end: { x, y },
      });
    }
  }

  const onPointerUpCanvas = (e: React.PointerEvent<SVGElement>) => {
    if (mode === "create" && shapeInCreation) {
      e.currentTarget.releasePointerCapture(e.pointerId);

      setShapes((prevShapes) => [...prevShapes, shapeInCreation.shape]);
      setShapeInCreation(null);
      setMode("select");
    } else if (mode === "select" && selectionRect) {
      const { start, end } = selectionRect;
      const rect = {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(start.x - end.x),
        height: Math.abs(start.y - end.y),
      };

      const selectedShapes = shapes.filter((shape) => {
        const [shapeX, shapeY] = shape.point;
        const [shapeWidth, shapeHeight] = shape.size;
        return (
          shapeX >= rect.x &&
          shapeY >= rect.y &&
          shapeX + shapeWidth <= rect.x + rect.width &&
          shapeY + shapeHeight <= rect.y + rect.height
        );
      });

      if (selectedShapes.length > 0) {
        setSelectedShapeIds(selectedShapes.map((shape) => shape.id));
      }

      setSelectionRect(null);
    }
  };

  const [camera, setCamera] = React.useState({
    x: 0,
    y: 0,
    z: 1,
  });

  const transform = `scale(${camera.z}) translate(${camera.x}px, ${camera.y}px)`;

  function onTextChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (editingText) {
      const updatedText = e.target.value;
      setEditingText({ ...editingText, text: updatedText });
      setShapes((prevShapes) =>
        prevShapes.map((shape) =>
          shape.id === editingText.id
            ? {
                ...shape,
                text: updatedText,
                size: [updatedText.length * 10, 100], // Update size based on text length
                fontSize: 40,
              }
            : shape
        )
      );
    }
  }

  function onTextBlur() {
    setEditingText(null);
    setMode("select");
  }

  function onRotateLeft() {
    if (mode === "select" && selectedShapeIds.length > 0) {
      setShapes((prevShapes) =>
        prevShapes.map((shape) =>
          selectedShapeIds.includes(shape.id) ? rotateShape(shape, -90) : shape
        )
      );
    }
  }

  function onRotateRight() {
    if (mode === "select" && selectedShapeIds.length > 0) {
      setShapes((prevShapes) =>
        prevShapes.map((shape) =>
          selectedShapeIds.includes(shape.id) ? rotateShape(shape, 90) : shape
        )
      );
    }
  }

  const updateDraggingRef = React.useCallback(
    (newRef: { shape: Shape; origin: number[] } | null) => {
      rDragging.current = newRef;
    },
    [rDragging]
  );

  return (
    <div>
      <ContextMenu
        onRotateLeft={onRotateLeft}
        onRotateRight={onRotateRight}
        onFlip={onFlip}
        sendBackToDeck={sendBackToDeck}
        sendBackToHand={sendBackToHand}
      >
        <svg
          ref={ref}
          onPointerDown={onPointerDownCanvas}
          onPointerMove={onPointerMoveCanvas}
          onPointerUp={onPointerUpCanvas}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <g style={{ transform }}>
            {shapes
              .filter((shape) => shape.id !== editingText?.id)
              .map((shape) => (
                <ShapeComponent
                  readOnly={false}
                  key={shape.id}
                  shape={shape}
                  shapes={shapes}
                  setShapes={setShapes}
                  setEditingText={setEditingText}
                  camera={camera}
                  mode={mode}
                  onSelectShapeId={setSelectedShapeIds}
                  rDragging={rDragging}
                  selectedShapeIds={selectedShapeIds}
                  inputRef={inputRef}
                  setHoveredCard={setHoveredCard}
                  updateDraggingRef={updateDraggingRef}
                />
              ))}
            {receivedData &&
              receivedData.map((shape: Shape) => (
                <ShapeComponent
                  readOnly={true}
                  key={shape.id}
                  shape={shape}
                  shapes={shapes}
                  setShapes={setShapes}
                  setEditingText={setEditingText}
                  camera={camera}
                  mode={mode}
                  onSelectShapeId={setSelectedShapeIds}
                  rDragging={rDragging}
                  selectedShapeIds={selectedShapeIds}
                  inputRef={inputRef}
                  setHoveredCard={setHoveredCard}
                  updateDraggingRef={updateDraggingRef}
                />
              ))}
            {shapeInCreation && (
              <ShapeComponent
                readOnly={false}
                setEditingText={setEditingText}
                key={shapeInCreation.shape.id}
                shape={shapeInCreation.shape}
                shapes={shapes}
                setShapes={setShapes}
                camera={camera}
                mode={mode}
                inputRef={inputRef}
                rDragging={rDragging}
                onSelectShapeId={setSelectedShapeIds}
                selectedShapeIds={selectedShapeIds}
                setHoveredCard={setHoveredCard}
                updateDraggingRef={updateDraggingRef}
              />
            )}
            {editingText && (
              <foreignObject
                x={
                  shapes.find((shape) => shape.id === editingText.id)
                    ?.point[0] ?? 0
                }
                y={
                  (shapes.find((shape) => shape.id === editingText.id)
                    ?.point[1] ?? 0) - 16
                }
                width={200}
                height={32}
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={editingText.text}
                  onChange={onTextChange}
                  onBlur={onTextBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      onTextBlur();
                    }
                  }}
                />
              </foreignObject>
            )}
            {selectionRect && (
              <rect
                x={Math.min(selectionRect.start.x, selectionRect.end.x)}
                y={Math.min(selectionRect.start.y, selectionRect.end.y)}
                width={Math.abs(selectionRect.start.x - selectionRect.end.x)}
                height={Math.abs(selectionRect.start.y - selectionRect.end.y)}
                fill="rgba(0, 0, 255, 0.3)"
                stroke="blue"
              />
            )}
          </g>
        </svg>
      </ContextMenu>
      <div>
        <SelectionPanel
          setCamera={setCamera}
          setMode={setMode}
          mode={mode}
          setShapeType={setShapeType}
          shapeType={shapeType}
          onRotateLeft={onRotateLeft}
          onRotateRight={onRotateRight}
          onMulligan={mulligan}
          onDrawCard={drawCard}
        />
      </div>
      <Hand cards={cards} setHoveredCard={setHoveredCard} />
      {isCommandPressed && hoveredCard && (
        <div className="zoomed-card">
          <img src={hoveredCard} alt={`Zoomed ${hoveredCard}`} />
        </div>
      )}
    </div>
  );
}

// allow user to select shapes (circle, rectangle, triangle, etc) or selection mode, zoom in/out
function SelectionPanel({
  onDrawCard,
  setMode,
  mode,
  onMulligan,
}: {
  onDrawCard: () => void;
  setCamera: React.Dispatch<React.SetStateAction<Camera>>;
  setMode: React.Dispatch<React.SetStateAction<Mode>>;
  mode: Mode;
  shapeType: ShapeType;
  setShapeType: React.Dispatch<React.SetStateAction<ShapeType>>;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onMulligan: () => void;
}) {
  const connectToPeer = usePeerStore((state) => state.connectToPeer);
  const peer = usePeerStore((state) => state.peer);
  const [peerId, setPeerId] = React.useState("");
  const [modal, showModal] = useModal();

  const connection = usePeerStore((state) => state.connection);
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const d = params.get("deck");

  return (
    <div className="selection-panel">
      <button onClick={onDrawCard}>Draw Card</button>
      <button
        disabled={mode === "create"}
        onClick={() => {
          setMode("create");
        }}
      >
        create text
      </button>
      <button disabled={mode === "select"} onClick={() => setMode("select")}>
        select
      </button>
      <button onClick={onMulligan}>Mulligan</button>
      <label>
        your id: <input type="text" defaultValue={peer?.id} readOnly />
      </label>
      <button onClick={() => connectToPeer(peerId)}>Connect to Peer</button>

      <input
        type="text"
        onChange={(e) => setPeerId(e.target.value)}
        value={peerId}
      />
      {connection && <div>connected to {connection.peer}</div>}
      {modal}
      <button
        onClick={() =>
          showModal("Select deck", (closeModal) => (
            <Form
              className="modal-form"
              onSubmit={() => {
                closeModal();
              }}
            >
              <textarea id="deck" name="deck" defaultValue={d ?? ""} />
              <button className="modal-button" type="submit">
                Submit
              </button>
            </Form>
          ))
        }
      >
        Select Deck
      </button>
    </div>
  );
}
