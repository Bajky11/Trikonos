import { Link } from "react-router-dom";
import CheckRounded from "@mui/icons-material/CheckRounded";
import "./purchase.css";

const steps = [
  { label: "Košík", path: "/kosik" },
  { label: "Údaje a doprava", path: "/pokladna" },
  { label: "Potvrzení", path: "/objednavka" },
];

export function PurchaseSteps({
  current,
  linkBack = true,
}: {
  current: 1 | 2 | 3;
  linkBack?: boolean;
}) {
  return (
    <nav aria-label="Průběh objednávky">
      <ol className="purchase-steps">
        {steps.map(({ label, path }, index) => {
          const done = index + 1 < current;
          return (
            <li key={path} aria-current={index + 1 === current ? "step" : undefined}>
              <span className="purchase-step-marker" aria-hidden="true">
                {done ? <CheckRounded fontSize="inherit" /> : index + 1}
              </span>
              {linkBack && done ? <Link to={path}>{label}</Link> : <span>{label}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
