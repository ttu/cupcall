import type { ReactElement, ReactNode } from 'react';

type SectionLabelProps = {
  children: ReactNode;
  icon?: ReactElement;
};

export function SectionLabel({ children, icon }: SectionLabelProps) {
  return (
    <div className="section-label">
      {icon}
      {children}
    </div>
  );
}
