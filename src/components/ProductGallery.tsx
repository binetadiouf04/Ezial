import { useState } from 'react';
import SmartImage from './SmartImage';

export default function ProductGallery({ images, alt }: { images: string[]; alt: string }) {
  const [active, setActive] = useState(0);
  return (
    <div className="flex flex-col-reverse gap-3 lg:flex-row">
      <div className="flex gap-2.5 overflow-x-auto no-scrollbar lg:flex-col lg:overflow-visible">
        {images.map((img, i) => (
          <button key={i} onClick={() => setActive(i)} className={`flex-shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${active === i ? 'border-burgundy' : 'border-line hover:border-ink/20'}`}>
            <SmartImage src={img} alt="" className="h-16 w-16 object-cover lg:h-20 lg:w-20" />
          </button>
        ))}
      </div>
      <div className="relative flex-1 overflow-hidden rounded-xl bg-cream"><SmartImage src={images[active]} alt={alt} className="aspect-[4/5] w-full object-cover fade-in" /></div>
    </div>
  );
}
