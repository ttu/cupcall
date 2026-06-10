type LogoProps = {
  size?: 'sm' | 'lg';
  dark?: boolean;
};

export function Logo({ size, dark = false }: LogoProps) {
  return (
    <span className="logo" style={{ color: dark ? 'var(--on-dark)' : 'var(--ink)' }}>
      <span className={`logo-mark${size === 'lg' ? ' lg' : ''}`} />
      <span className="logo-word">
        CUP<span className="b">CALL</span>
      </span>
    </span>
  );
}
