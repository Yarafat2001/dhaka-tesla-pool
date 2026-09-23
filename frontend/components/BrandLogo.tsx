import Image from 'next/image';

// The brand mark is a wide (landscape) rickshaw illustration, so it is sized
// by height and lets the width follow the aspect ratio instead of forcing a
// square box (which would squash it).
export default function BrandLogo({ height = 46 }: { height?: number }) {
  return (
    <Image
      src="/logo.png"
      alt="Dhaka Tesla Pool logo"
      width={Math.round(height * 1.5)}
      height={height}
      className="brand-logo"
      priority
    />
  );
}
