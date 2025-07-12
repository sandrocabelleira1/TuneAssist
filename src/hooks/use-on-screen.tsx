'use client';

import { useState, useEffect, type RefObject } from 'react';

export function useOnScreen(ref: RefObject<Element>): boolean {
  const [isIntersecting, setIntersecting] = useState(false);

  useEffect(() => {
    // Ensure this only runs in the browser
    if (typeof window === 'undefined' || !window.IntersectionObserver || !ref.current) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Update our state when observer callback fires
        if (entry.isIntersecting) {
            setIntersecting(true);
            // We only need to know once that it's visible, so we can disconnect.
            observer.disconnect();
        }
      },
      {
        rootMargin: '0px',
      }
    );
    
    const currentRef = ref.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if(currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [ref]); // Re-run effect only when ref changes

  return isIntersecting;
}