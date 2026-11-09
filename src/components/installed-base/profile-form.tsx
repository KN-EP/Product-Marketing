"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setIndustryProfileAction } from "@/app/actions/installed-base";
import { actionErrorText } from "@/components/review/action-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/** Admins choose the industry profile: which win/loss reason codes the tenant uses (M18). */
export function ProfileForm({ profile }: { profile: string }) {
  const router = useRouter();
  const [value, setValue] = useState(profile);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await setIndustryProfileAction({ profile: value });
          if (res.ok) router.refresh();
          else setError(actionErrorText(res));
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ind-profile">Industry profile</Label>
        <select id="ind-profile" className="h-9 rounded-md border bg-background px-2 text-sm" value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="software">Software vendor</option>
          <option value="machinery">Machine builder</option>
        </select>
      </div>
      <Button type="submit" size="sm" disabled={pending || value === profile}>
        Save
      </Button>
      <span role="alert" className="text-sm text-destructive">
        {error}
      </span>
    </form>
  );
}
