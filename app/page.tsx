import Link from 'next/link';

export default function Home() {
  return (
    <main className="w-screen h-screen m-0 p-0 overflow-hidden bg-black">
      <Link href="/login" className="relative block w-full h-full cursor-pointer">
        <picture>
          <source media="(min-width: 768px)" srcSet="/horiz.png" />
          <img 
            src="/vert.png" 
            alt="Anabolic Splash Screen" 
            className="w-full h-full object-cover object-center" 
          />
        </picture>
      </Link>
    </main>
  );
}
