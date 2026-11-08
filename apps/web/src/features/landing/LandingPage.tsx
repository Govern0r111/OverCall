import { BetaNote } from "./BetaNote";
import { DashboardPreview } from "./DashboardPreview";
import { Faq } from "./Faq";
import { Footer } from "./Footer";
import { Hero } from "./Hero";
import { HowItWorks } from "./HowItWorks";
import { Nav } from "./Nav";
import { WhatWeCatch } from "./WhatWeCatch";
import "./landing.css";

export function LandingPage() {
  return (
    <div className="landing-page">
      <Nav />
      <main id="main-content" tabIndex={-1}>
        <Hero />
        <DashboardPreview />
        <HowItWorks />
        <WhatWeCatch />
        <BetaNote />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
