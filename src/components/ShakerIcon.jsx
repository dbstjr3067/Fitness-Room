// Protein shaker glyph in the same line style as lucide icons (used by 세척했나요?).
export default function ShakerIcon({ size = 24, strokeWidth = 2, color = 'currentColor', className, ...rest }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {/* flip-top cap and spout */}
      <path d="M8.5 5V3.5A1.5 1.5 0 0 1 10 2h4a1.5 1.5 0 0 1 1.5 1.5V5" />
      <path d="M11.5 2V1.2" />
      {/* screw lid */}
      <rect x="6" y="5" width="12" height="3" rx="1" />
      {/* cup */}
      <path d="M7 8l1.1 12.3A2 2 0 0 0 10.1 22h3.8a2 2 0 0 0 2-1.7L17 8" />
      {/* measuring marks */}
      <path d="M9.5 11.5h2.5M9.7 14.5h1.8M9.9 17.5h2.1" />
    </svg>
  );
}
