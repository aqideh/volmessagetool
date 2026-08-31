"use client";

import { useEffect, useState } from "react";
import { NAME_PREFERENCE_KEY } from "@/lib/message";

export default function NamePreferenceToggle() {
  const [useFullName, setUseFullName] = useState(false);

  useEffect(() => {
    setUseFullName(window.localStorage.getItem(NAME_PREFERENCE_KEY) === "true");
  }, []);

  function updatePreference(checked: boolean) {
    window.localStorage.setItem(NAME_PREFERENCE_KEY, String(checked));
    setUseFullName(checked);
    window.location.reload();
  }

  return (
    <label className="name-preference-toggle" title="Choose whether {{first_name}} uses the volunteer's first name or full name">
      <span className="toggle-copy">
        <strong>Full names</strong>
        <small>{useFullName ? "Using full name" : "Using first name"}</small>
      </span>
      <input
        type="checkbox"
        checked={useFullName}
        onChange={(event) => updatePreference(event.target.checked)}
        aria-label="Use volunteer full names in messages"
      />
      <span className="toggle-track" aria-hidden="true"><span className="toggle-knob" /></span>
    </label>
  );
}
