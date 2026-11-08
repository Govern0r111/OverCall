import { ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";

export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__copy">
        <p className="eyebrow"><Sparkles aria-hidden="true" size={15} /> API cost intelligence</p>
        <h1 id="hero-title">Your API spend, made clear.</h1>
        <p className="hero__lead">
          Understand API usage, reliability, and estimated savings from request metadata. Provider
          keys stay in your app; request and response bodies are not stored.
        </p>
        <div className="hero__actions">
          <Button asChild size="lg" className="h-11 px-5">
            <Link to="/app">
            Try the demo <ArrowRight aria-hidden="true" size={17} />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-11 px-5">
            <a href="#how-it-works">See how it works</a>
          </Button>
        </div>
      </div>
    </section>
  );
}
