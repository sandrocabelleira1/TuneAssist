'use client';

import { useState, useEffect, type RefObject } from 'react';

export function useOnScreen(ref: RefObject<Element>): boolean {
  const [isIntersecting, setIntersecting] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.IntersectionObserver) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIntersecting(entry.isIntersecting);
      },
      {
        rootMargin: '0px',
      }
    );
    
    const currentRef = ref.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    // Cleanup function to unobserve the element when the component unmounts
    return () => {
      if(currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [ref]); 

  return isIntersecting;
}
