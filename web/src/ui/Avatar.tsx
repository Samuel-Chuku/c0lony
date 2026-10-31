import { cx } from "./cx";
import { PixelIcon } from "./PixelIcon";

export function shortAddress(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

export type AvatarProps = { src?: string | null; address?: string; size?: 40 | 56 | 64; alt: string; className?: string };

export function Avatar({ src, address, size = 40, alt, className }: AvatarProps) {
  return (
    <span className={cx("c0-avatar", `c0-avatar--${size}`, className)} title={address ? shortAddress(address) : undefined}>
      {src ? <img src={src} alt={alt} /> : <PixelIcon name="ant-head" label={alt} />}
    </span>
  );
}
