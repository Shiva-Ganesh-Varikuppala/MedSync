import React from "react";

// The MedSync mark: a two-tone capsule. Reused in the header, on the sign-in screen and as the favicon.
import medsyncRibbonMark from "../assets/medsync-ribbon-mark.png";

// The supplied Ribbon Mark is the single source of truth for the MedSync logo.
export default function Brand({ size = 28 }) {
  return <img className="brand-mark" src={medsyncRibbonMark} alt="MedSync" style={{ height: size }} />;
}
