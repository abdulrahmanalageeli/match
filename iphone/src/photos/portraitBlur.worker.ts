import { blurPixels } from './portraitBlur';

// No network or persistent state: each job receives only the cropped pixels.
const scope = self as unknown as Pick<Worker, 'postMessage' | 'onmessage'>;
scope.onmessage = (event: MessageEvent<{pixels:ArrayBuffer;width:number;height:number;radius:number}>) => {
  const {pixels,width,height,radius}=event.data;
  blurPixels(new Uint8ClampedArray(pixels),width,height,radius);
  scope.postMessage(pixels,[pixels]);
};
