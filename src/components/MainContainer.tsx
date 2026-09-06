import type { ReactNode } from "react";

interface MainContainerProps {
  children: ReactNode;
}

/**
 * The single page content wrapper: constrains width, applies horizontal
 * gutters, and provides vertical rhythm between the header and footer.
 */
export function MainContainer({ children }: MainContainerProps) {
  return (
    <main className="mx-auto w-full max-w-[var(--container-max)] flex-1 px-4 py-10 sm:px-6 sm:py-14">
      {children}
    </main>
  );
}
