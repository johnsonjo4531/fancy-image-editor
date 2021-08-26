import * as PIXI from "pixi.js";
import { AdjustmentFilter, AdjustmentFilterOptions } from "@pixi/filter-adjustment";
import {
  Container,
  Stage,
  Sprite,
  withFilters,
  Graphics
} from "@inlet/react-pixi";
import React, {
  PropsWithChildren,
  useEffect,
  useRef,
  useState
} from "react";
import { DropzoneOptions, useDropzone } from "react-dropzone";
import ResizeObserver from "resize-observer-polyfill";

const Filters = withFilters(Container, {
  // blur: PIXI.filters.BlurFilter,
  adjust: AdjustmentFilter,
  color: PIXI.filters.ColorMatrixFilter
});

const CYAN: PIXI.utils.ArrayFixed<number, 20> = [1,  0,   0,   0,   0,
  0,   1,   0,   0,   0,
  0,   0,   1,   0,   0,
  0,   0,   0,   1,   0];

function useInput(stateValue: string, {
  label,
  ...props
}: { label?: string } & React.DetailedHTMLProps<
  React.InputHTMLAttributes<HTMLInputElement>,
  HTMLInputElement
>) {
  const [value, setValue] = useState(stateValue ?? '');
  return [
    value,
    <div key={label}>
      <label>{label}</label>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        {...props}
      />
    </div>
  ] as const;
}

function MyImageDropzone({
  children,
  style,
  ...dropOptions
}: PropsWithChildren<
  DropzoneOptions & {
    style?: React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLDivElement>,
      HTMLDivElement
    >["style"];
  }
>) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ["image/png", "image/jpg", "image/jpeg", "image/gif", "image/webp"],
    ...dropOptions
  });

  return (
    <div {...getRootProps()}>
      <input {...getInputProps()} />
      {isDragActive ? (
        <p>Drop the files here ...</p>
      ) : (
        <p>Drag 'n' drop some files here, or click to select files</p>
      )}
      {/* {children} */}
    </div>
  );
}

function CircleOutline({
  x,
  y,
  radius,
  lineWidth
}: {
  lineWidth: number;
  x: number;
  y: number;
  radius: number;
}) {
  return (
    <Graphics
      draw={(g) => {
        g.clear();
        g.lineStyle(lineWidth, 0xe8e8e8);
        g.drawCircle(x, y, radius - lineWidth / 2);
      }}
    />
  );
}

function CircleMask({
  x,
  y,
  radius,
  lineWidth,
  maskRef
}: {
  lineWidth: number;
  x: number;
  y: number;
  radius: number;
  maskRef: React.RefObject<PIXI.Graphics>;
}) {
  return (
    <Graphics
      ref={maskRef}
      draw={(g) => {
        g.clear();
        g.lineStyle(lineWidth, 0xe8e8e8, 0.7);
        g.beginFill();
        g.drawCircle(x, y, radius - lineWidth / 2);
        g.endFill();
      }}
    />
  );
}

const findImageDimensions = (url: string) => {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = document.createElement("img");
    img.onload = () => resolve(img);
    img.onabort = reject;
    img.oncancel = reject;
    img.onerror = reject;
    img.src = url;
  });
};

/** The least of the args is picked
 * any single arg denotes the most
 * any other arg could possibly be.
 */
function atMost(...args: number[]) {
  return Math.min(...args);
}

/** The largest of the args is picked
 * any single arg denotes the least
 * any other arg could possibly be.
 */
function atLeast(...args: number[]) {
  return Math.max(...args);
}

function useContentRect(stageRef: React.MutableRefObject<HTMLElement | null>) {
  const [state, setState] = useState<Omit<DOMRectReadOnly, "toJSON">>({
    width: 0,
    height: 0,
    bottom: 0,
    top: 0,
    left: 0,
    right: 0,
    x: 0,
    y: 0
  });
  useEffect(() => {
    if (!stageRef.current) {
      return;
    }
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        if (entry.contentRect) {
          setState(entry.contentRect);
        }
      }
    });

    resizeObserver.observe(stageRef.current);
    return () => {
      resizeObserver.disconnect();
    };
  }, [stageRef]);
  return state;
}

function useAdjustmentRange (label: string, options?: React.ClassAttributes<HTMLInputElement> & React.InputHTMLAttributes<HTMLInputElement> ) {
  const [adjustment, adjustmentInput] =  useInput('1', {
    type: "range",
    label,
    max: 5,
    min: 0,
    step: 0.1,
    ...options
  });
  return [parseFloat(adjustment), adjustmentInput] as const;
}

const ImageEditor = ({ width }: { width: string }) => {
  const [scale, scaleInput] = useAdjustmentRange('Scale', {
    min: 1,
  });
  const [gamma, gammaInput] = useAdjustmentRange('Gamma');
  const [brightness, brightnessInput] = useAdjustmentRange('Brightness');
  const [saturation, saturationInput] = useAdjustmentRange('Saturation');
  const [contrast, contrastInput] = useAdjustmentRange('Contrast');
  const [red, redInput] = useAdjustmentRange('Red');
  const [green, greenInput] = useAdjustmentRange('Green');
  const [blue, blueInput] = useAdjustmentRange('Blue');
  const [alpha, alphaInput] = useAdjustmentRange('Alpha');
  const adjustments: Partial<AdjustmentFilter & {
      construct: [options?: Partial<AdjustmentFilterOptions> | undefined];
  }> | undefined = {
    gamma,
    brightness,
    saturation,
    contrast,
    red,
    green,
    blue,
    alpha
  }
  const adjustmentInputs: readonly React.ReactNode[] = [gammaInput, brightnessInput, saturationInput, contrastInput,redInput, greenInput, blueInput, alphaInput] as const;
  const circleMask = useRef<PIXI.Graphics | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const { width: containerWidth, top, left } = useContentRect(stageRef);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [[imgWidth, imgHeight], setImgDim] = useState<[number, number]>([0, 0]);
  const whRatio = (imgWidth / imgHeight) * (containerWidth / containerWidth);
  const [imgContainerScaledWidth, imgContainerScaledHeight] = [
    // Can be at most container width
    atMost(containerWidth, containerWidth * whRatio),
    atMost(containerWidth, containerWidth / whRatio)
  ];
  const minContainerDim = Math.min(imgContainerScaledWidth, imgContainerScaledHeight);
  
  const [imgScaledWidth, imgScaledHeight] = [
    imgContainerScaledWidth * scale,
    imgContainerScaledHeight * scale
  ];
  const minDim = Math.min(imgScaledWidth, imgScaledHeight);
  // const maxDim = Math.max(imgScaledWidth, imgScaledHeight);
  const [[x, y], setPan] = useState<[number, number]>([0, 0]);
  const [[startX, startY], setStart] = useState([0, 0]);

  useEffect(() => {
    const dx = startX;
    const dy = startY;
    const boundingBox = {
      left: 0,
      right: Math.abs(imgContainerScaledWidth - minDim),
      top: 0,
      bottom: Math.abs(imgContainerScaledHeight - minDim),
    }
    console.log({right: boundingBox.right, x: x + dx});
    console.log({bottom: boundingBox.bottom, y: y + dy});
    setPan([
      /** The image should not be panned past the left of the circle or the right.
       */
      atLeast(-(boundingBox.right), atMost(boundingBox.left, x + dx)),
      /** The image should not be panned past the top of the circle or the bottom.
       */
      atLeast(-(boundingBox.bottom), atMost(boundingBox.top, y + dy))
    ]);
  }, [scale, startX, startY, imgContainerScaledWidth, imgContainerScaledHeight, minDim, x, y]);

  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    setPan([0, 0]);
    setStart([0, 0]);
  }, [imgUrl]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging) {
        return;
      }
      const [mouseX, mouseY] = [e.clientX - left, e.clientY - top];
      setStart([mouseX, mouseY]);
      document.body.style.cursor = "grabbing";
      const dx = (mouseX - startX);
      const dy = (mouseY - startY);
      const boundingBox = {
        left: 0,
        right: Math.abs(imgContainerScaledWidth - minDim),
        top: 0,
        bottom: Math.abs(imgContainerScaledHeight - minDim),
      }
      console.log(boundingBox.right, x + dx);
      console.log(boundingBox.bottom, y + dy);
      setPan([
        /** The image should not be panned past the left of the circle or the right.
         */
        atLeast(-(boundingBox.right), atMost(boundingBox.left, x + dx)),
        /** The image should not be panned past the top of the circle or the bottom.
         */
        atLeast(-(boundingBox.bottom), atMost(boundingBox.top, y + dy))
      ]);
    };

    const onMouseUp = (e: MouseEvent) => {
      document.body.style.cursor = "unset";
      setDragging(false);
      return false;
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [
    setDragging,
    dragging,
    left,
    startX,
    startY,
    x,
    y,
    top,
    containerWidth,
    imgWidth,
    width,
    imgScaledWidth,
    imgScaledHeight,
    minDim,
    scale,
    minContainerDim,
    imgContainerScaledWidth,
    imgContainerScaledHeight
  ]);

  return (
    <div
      style={{
        borderRadius: "1.7rem",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        boxSizing: "border-box",
        width,
        cursor: dragging ? "grabbing" : "grab",
        backgroundColor: "#acacac",
        color: "white",
        padding: "1.7rem"
      }}
      ref={stageRef}
    >
      <MyImageDropzone
        maxFiles={1}
        onDropAccepted={(file) => {
          const reader = new FileReader();
          reader.onloadend = (e) => {
            const imgUrl = e.target?.result?.toString();
            if (imgUrl) {
              setImgUrl(imgUrl);
              findImageDimensions(imgUrl)
                .then((img) => {
                  setImgDim([img.naturalWidth, img.naturalHeight]);
                })
                .catch(console.error.bind(console));
            }
          };
          reader.readAsDataURL(file[0]);
        }}
      />
      <Stage
        style={{ width: "100%" }}
        options={{ antialias: true, transparent: true }}
        onMouseDown={(e) => {
          const [mouseX, mouseY] = [e.clientX - left, e.clientY - top];
          setStart([mouseX, mouseY]);
          setDragging(true);
          e.preventDefault();
          e.stopPropagation();
          return false;
        }}
        // onClick={(e) => {
        //   e.preventDefault();
        //   e.stopPropagation();
        //   return false;
        // }}
        // onMouseLeave={(e) => {
        //   setDragging(false);
        // }}
        width={imgContainerScaledWidth ?? 0}
        height={imgContainerScaledHeight ?? 0}
      >
        <CircleMask
          maskRef={circleMask}
          lineWidth={10 ?? 0}
          x={imgContainerScaledWidth / 2}
          y={imgContainerScaledHeight / 2}
          radius={minContainerDim / 2}
        />
        <Filters
          position={{
            x,
            y,
          }}
          scale={scale}
          adjust={adjustments}
          color={
            {
              matrix: CYAN
            }
          }
          mask={circleMask.current}
        >
          {imgUrl && (
            <Sprite
              mask={circleMask.current}
              width={imgContainerScaledWidth ?? 0}
              height={imgContainerScaledHeight ?? 0}
              // anchor={[0.5, 0.5]}
              image={imgUrl}
            />
          )}
        </Filters>
        <CircleOutline
          lineWidth={10}
          x={imgContainerScaledWidth / 2}
          y={imgContainerScaledHeight / 2}
          radius={minContainerDim / 2}
        />
      </Stage>
      {scaleInput}
      {adjustmentInputs}
    </div>
  );
};

export default () => {
  const [value, input] = useInput('1', {
    label: "Width",
    type: "range",
    min: 0.2,
    max: 1,
    step: 0.1
    // key: "input-range"
  });
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column"
      }}
    >
      <ImageEditor width={`${Math.floor(parseFloat(value) * 100)}%`} />
      {input}
    </div>
  );
};
