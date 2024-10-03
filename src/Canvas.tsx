import * as React from "react";
import { Shape as ShapeComponent } from "./Shape";
import "./Canvas.css";
import { screenToCanvas, sub } from "./utils/vec";
import Hand from "./Hand";
import ContextMenu from "./ContextMenu";
import useCards from "./useCards";
import { useEffect } from "react";
import { usePeerStore } from "./usePeerConnection";

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

function zoomIn(camera: Camera): Camera {
  const i = Math.round(camera.z * 100) / 25;
  const nextZoom = (i + 1) * 0.25;
  const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  return zoomCamera(camera, center, camera.z - nextZoom);
}

function zoomOut(camera: Camera): Camera {
  const i = Math.round(camera.z * 100) / 25;
  const nextZoom = (i - 1) * 0.25;
  const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  return zoomCamera(camera, center, camera.z - nextZoom);
}

function generateId() {
  return Math.random().toString(36).substr(2, 9);
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
  return new Set(
    fromArena
      .split("\n")
      .map((s) => {
        const withoutNumber = s.replace(/^[0-9]+/g, "").trim();
        if (withoutNumber.includes("//")) {
          //Double faced card
          return withoutNumber.split("//")[0].trim();
        }
        return withoutNumber;
      })
      .filter((s) => s !== "")
  );
}

export default function Canvas() {
  const receivedData = usePeerStore((state) => state.receivedData);
  const sendData = usePeerStore((state) => state.sendData);

  console.log("peerData", receivedData);
  const { data } = useCards(
    Array.from(processRawText(DEFAULT_DECK.join("\n")))
  );

  useEffect(() => {
    if (data) {
      const hand: Card[] = data.data
        .filter((card) => card.image_uris?.normal)
        .map((card) => ({
          id: card.id,
          src: card.image_uris.normal,
        }));
      setCards(hand.slice(0, 7));
      setDeck(hand.slice(7));
    }
  }, [data]);

  const ref = React.useRef<SVGSVGElement>(null);
  const rDragging = React.useRef<{
    shape: Shape;
    origin: number[];
  } | null>(null);
  const [shapes, setShapes] = React.useState<Shape[]>([
    {
      id: "d",
      point: [400, 100],
      size: [100, 100],
      type: "text",
      text: "Battlefield",
      fontSize: 40,
      rotation: 0,
    },
    // graveyard
    {
      id: "c",
      point: [400, 200],
      size: [100, 100],
      type: "text",
      text: "Graveyard",
      fontSize: 40,
      rotation: 0,
    },
    // exile
    {
      id: "e",
      point: [400, 300],
      size: [100, 100],
      type: "text",
      text: "Exile",
      fontSize: 40,
      rotation: 0,
    },
  ]);
  const [shapeInCreation, setShapeInCreation] = React.useState<{
    shape: Shape;
    origin: number[];
  } | null>(null);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const [mode, setMode] = React.useState<Mode>("select");
  const [shapeType, setShapeType] = React.useState<ShapeType>("rectangle");
  const [selectedShapeIds, setSelectedShapeIds] = React.useState<string[]>([]);
  const [cards, setCards] = React.useState<Card[]>([]);
  const [deck, setDeck] = React.useState<Card[]>([]);

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

  useEffect(() => {
    sendData(shapes);
  }, [shapes, sendData]);

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

      console.log("selectedShapes", selectedShapes);

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

  React.useEffect(() => {
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

  React.useEffect(() => {
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

  // function changeTextSize(shape: Shape, newSize: number) {
  //   return {
  //     ...shape,
  //     fontSize: newSize,
  //   };
  // }

  // function onSizeChange(e: React.ChangeEvent<HTMLInputElement>) {
  //   const newSize = parseInt(e.target.value, 10);
  //   if (selectedShapeIds.length > 0 && !isNaN(newSize)) {
  //     setShapes((prevShapes) =>
  //       prevShapes.map((shape) => {
  //         if (selectedShapeIds.includes(shape.id)) {
  //           const [x, y] = shape.point;
  //           const [width, height] = shape.size;
  //           const deltaX = (newSize - width) / 2;
  //           const deltaY = (newSize - height) / 2;

  //           return {
  //             ...shape,
  //             point: [x - deltaX, y - deltaY], // Adjust the point to keep the anchor the same
  //             size: [newSize, newSize], // Assuming square shapes for simplicity
  //           };
  //         }
  //         return shape;
  //       })
  //     );
  //   }
  // }

  const handleDrop = (e: React.DragEvent<SVGElement>) => {
    e.preventDefault();
    const cardSrc = e.dataTransfer.getData("text/plain");
    const { x, y } = screenToCanvas({ x: e.clientX, y: e.clientY }, camera);
    const id = generateId();
    setCards((prevCards) => prevCards.filter((card) => card.src !== cardSrc));

    setShapes((prevShapes) => [
      ...prevShapes,
      {
        id,
        point: [x, y],
        size: [100, 100], // Default size, can be adjusted
        type: "image",
        src: cardSrc,
        rotation: 0,
      },
    ]);
  };

  const drawCard = () => {
    setDeck((prevDeck) => {
      if (prevDeck.length === 0) return prevDeck; // No cards to draw
      const [, ...remainingDeck] = prevDeck;
      return remainingDeck;
    });
    setCards((prevCards) => [
      ...prevCards,
      {
        id: generateId(),
        src: deck[0].src,
        rotation: 0,
      },
    ]);
  };

  function mulligan() {
    setDeck((prevDeck) => [...prevDeck, ...cards]);
    setCards([]);
  }

  const sendBackToHand = () => {
    const selectedCards = shapes.filter((shape) =>
      selectedShapeIds.includes(shape.id)
    )!;
    setCards((prevCards) => [
      ...prevCards,
      ...selectedCards.map((card) => ({
        id: card.id,
        src: card.src as string,
      })),
    ]);
    setShapes((prevShapes) =>
      prevShapes.filter((shape) => !selectedShapeIds.includes(shape.id))
    );
    setSelectedShapeIds([]);
  };

  const sendBackToDeck = () => {
    const selectedCards = shapes.filter((shape) =>
      selectedShapeIds.includes(shape.id)
    )!;
    setDeck((prevDeck) => [
      ...prevDeck,
      ...selectedCards.map((card) => ({
        id: card.id,
        src: card.src as string,
      })),
    ]);
    setShapes((prevShapes) =>
      prevShapes.filter((shape) => !selectedShapeIds.includes(shape.id))
    );
    setSelectedShapeIds([]);
  };

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
          // changeTextSize={changeTextSize}
          // onSizeChange={onSizeChange}
          key={selectedShapeIds.length > 0 ? selectedShapeIds[0] : "none"}
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
  setCamera,
  setMode,
  mode,
  shapeType,
  setShapeType,
  onRotateLeft,
  onRotateRight,
  // changeTextSize,
  // sizeInput,
  // onSizeChange,
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
  // changeTextSize: (shape: Shape, newSize: number) => void;
  // sizeInput: number | null;
  // onSizeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const initPeer = usePeerStore((state) => state.initPeer);
  const connectToPeer = usePeerStore((state) => state.connectToPeer);
  const sendData = usePeerStore((state) => state.sendData);
  const peer = usePeerStore((state) => state.peer);
  const [peerId, setPeerId] = React.useState("");

  return (
    <div className="selection-panel">
      <select
        value={shapeType}
        onChange={(e) => setShapeType(e.target.value as ShapeType)}
      >
        <option value="rectangle">Rectangle</option>
        <option value="circle">Circle</option>
        <option value="arrow">Arrow</option>
        <option value="text">Text</option>
        <option value="image">Image</option>
      </select>
      <button onClick={onDrawCard}>Draw Card</button>
      <button
        disabled={mode === "create"}
        onClick={() => {
          setMode("create");
        }}
      >
        create
      </button>
      <button disabled={mode === "select"} onClick={() => setMode("select")}>
        select
      </button>
      <button onClick={() => setCamera(zoomIn)}>Zoom In</button>
      <button onClick={() => setCamera(zoomOut)}>Zoom Out</button>
      <button onClick={onRotateLeft}>Rotate Left</button>
      <button onClick={onRotateRight}>Rotate Right</button>
      {/* <input
        type="range"
        min="10"
        max="500"
        value={sizeInput ?? 0}
        onChange={onSizeChange}
        placeholder="Size"
      /> */}
      <button onClick={onMulligan}>Mulligan</button>
      <button onClick={initPeer}>Init Peer</button>
      <input
        type="text"
        onChange={(e) => setPeerId(e.target.value)}
        value={peerId}
      />
      <button onClick={() => connectToPeer(peerId)}>Connect to Peer</button>
      <button onClick={() => sendData(Math.random())}>Send Data</button>
      <input readOnly value={peer?.id} />
    </div>
  );
}
