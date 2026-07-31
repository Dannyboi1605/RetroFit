import PixelBox from "@/components/pixel-box";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 p-6">
      <header>
        <h1 className="font-headline text-3xl font-extrabold tracking-widest text-primary">
          RETROFIT
        </h1>
        <p className="font-mono text-xs text-on-surface-variant">
          SCAFFOLD v0.1 // TOKENS OK
        </p>
      </header>

      <PixelBox title="Calories">
        <div className="mb-1 flex justify-between font-mono text-xs text-on-surface-variant">
          <span>1,245 / 2,000 kcal</span>
          <span>62%</span>
        </div>
        <div className="h-4 w-full bg-surface-bright">
          <div className="h-full w-[62%] bg-primary-container" />
        </div>
      </PixelBox>

      <PixelBox title="Macros">
        <div className="mb-1 flex justify-between font-mono text-xs text-on-surface-variant">
          <span>PROTEIN</span>
          <span>98 / 150g</span>
        </div>
        <div className="h-2 w-full bg-surface-bright">
          <div className="h-full w-[65%] bg-secondary-container" />
        </div>
        <div className="mb-1 mt-3 flex justify-between font-mono text-xs text-on-surface-variant">
          <span>CARBS</span>
          <span>142 / 200g</span>
        </div>
        <div className="h-2 w-full bg-surface-bright">
          <div className="h-full w-[71%] bg-tertiary-container" />
        </div>
      </PixelBox>

      <button className="pixel-border bg-primary-container px-4 py-2 font-mono text-sm font-semibold text-on-primary-container">
        + LOG MANUALLY
      </button>
    </main>
  );
}
