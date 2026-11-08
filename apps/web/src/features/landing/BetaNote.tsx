import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";

export function BetaNote() {
  return (
    <section className="beta-note" aria-labelledby="beta-title">
      <div className="container beta-note__inner">
        <div>
          <p className="eyebrow">Early access</p>
          <h2 id="beta-title">Free while we build the beta.</h2>
          <p>Try the demo with sample data, or create an account to get started.</p>
        </div>
        <Button asChild variant="outline" size="lg" className="h-11 px-5">
          <Link to="/signup">
            Create an account <ArrowRight aria-hidden="true" size={17} />
          </Link>
        </Button>
      </div>
    </section>
  );
}
