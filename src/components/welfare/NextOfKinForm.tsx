import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { normalizePhone, isValidKenyanPhone } from "@/utils/phoneUtils";
import { NextOfKinPDFDownload } from "./NextOfKinPDFDownload";

export const NEXT_OF_KIN_NOTICE =
  "I understand that this person is my nominated next of kin. In the event of my death or incapacity, they are authorised to receive my dividends, contributions and any other benefits due to me from this welfare group.";

const RELATIONSHIPS = ["Spouse", "Parent", "Child", "Sibling", "Other"];

const schema = z.object({
  full_name: z.string().trim().min(2, "Enter the full legal name").max(100, "Name is too long"),
  phone: z.string().trim().refine((v) => isValidKenyanPhone(v), "Enter a valid Kenyan phone number"),
  date_of_birth: z.string().min(1, "Date of birth is required"),
  relationship: z.string().min(1, "Select the relationship"),
  relationship_other: z.string().trim().max(60).optional(),
  gender: z.enum(["male", "female"], { errorMap: () => ({ message: "Select male or female" }) }),
});

export interface NextOfKinRecord {
  id: string;
  full_name: string;
  phone: string;
  date_of_birth: string;
  relationship: string;
  relationship_other: string | null;
  gender: string;
  locked_until: string;
  acknowledged_at: string;
  updated_at: string;
}

interface Props {
  welfareId: string;
  welfareName: string;
  memberId?: string | null;
  memberCode?: string | null;
  memberName?: string | null;
  onSaved?: () => void;
}

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export function NextOfKinForm({ welfareId, welfareName, memberId, memberCode, memberName, onSaved }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [record, setRecord] = useState<NextOfKinRecord | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ack, setAck] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    date_of_birth: "",
    relationship: "",
    relationship_other: "",
    gender: "",
  });

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("welfare_next_of_kin")
      .select("*")
      .eq("welfare_id", welfareId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) console.error("next of kin load", error);
    setRecord((data as any) || null);
    if (data) {
      setForm({
        full_name: data.full_name,
        phone: data.phone,
        date_of_birth: data.date_of_birth,
        relationship: data.relationship,
        relationship_other: data.relationship_other || "",
        gender: data.gender,
      });
      setEditing(false);
    } else {
      setEditing(true);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [welfareId, user?.id]);

  const locked = !!record && new Date(record.locked_until) > new Date();

  const validate = () => {
    const parsed = schema.safeParse(form);
    const next: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message;
    }
    if (form.date_of_birth) {
      const dob = new Date(form.date_of_birth);
      const age = (Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000);
      if (dob > new Date()) next.date_of_birth = "Date of birth cannot be in the future";
      else if (age < 18) next.date_of_birth = "Next of kin must be at least 18 years old";
    }
    if (form.relationship === "Other" && !form.relationship_other.trim())
      next.relationship_other = "Describe the relationship";
    if (!ack) next.ack = "You must accept the declaration";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmitClick = () => {
    if (validate()) setConfirmOpen(true);
  };

  const save = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const payload = {
        welfare_id: welfareId,
        member_id: memberId || null,
        user_id: user.id,
        full_name: form.full_name.trim(),
        phone: normalizePhone(form.phone) || form.phone.trim(),
        date_of_birth: form.date_of_birth,
        relationship: form.relationship,
        relationship_other: form.relationship === "Other" ? form.relationship_other.trim() : null,
        gender: form.gender,
      };

      if (record) {
        const { error } = await supabase
          .from("welfare_next_of_kin")
          .update(payload as any)
          .eq("id", record.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("welfare_next_of_kin").insert(payload as any);
        if (error) throw error;
      }
      toast.success("Next of kin details saved");
      setConfirmOpen(false);
      setAck(false);
      await load();
      onSaved?.();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Could not save next of kin details");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card id="next-of-kin">
        <CardContent className="py-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const relationshipLabel =
    record?.relationship === "Other" ? record?.relationship_other || "Other" : record?.relationship;

  return (
    <Card id="next-of-kin" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Next of Kin
        </CardTitle>
        <CardDescription>
          The person who will receive your dividends, contributions and any other benefits from{" "}
          {welfareName} should anything happen to you. These details are confidential and visible only
          to the platform administration.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {record && !editing ? (
          <>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Legal name</dt>
                <dd className="font-semibold">{record.full_name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Phone number</dt>
                <dd className="font-semibold font-mono">{record.phone}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Date of birth</dt>
                <dd className="font-semibold">{fmtDate(record.date_of_birth)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Relationship to you</dt>
                <dd className="font-semibold">{relationshipLabel}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Gender</dt>
                <dd className="font-semibold capitalize">{record.gender}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Submitted on</dt>
                <dd className="font-semibold">{fmtDate(record.updated_at)}</dd>
              </div>
            </dl>

            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              {NEXT_OF_KIN_NOTICE}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <NextOfKinPDFDownload
                record={record}
                welfareName={welfareName}
                memberCode={memberCode}
                memberName={memberName}
              />
              {locked ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Lock className="h-3.5 w-3.5" />
                  Editable from {fmtDate(record.locked_until)}
                </span>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  Update details
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="nok-name">Full legal name</Label>
                <Input
                  id="nok-name"
                  value={form.full_name}
                  maxLength={100}
                  placeholder="As it appears on their national ID"
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                />
                {errors.full_name && <p className="text-xs text-destructive">{errors.full_name}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="nok-phone">Phone number</Label>
                <Input
                  id="nok-phone"
                  inputMode="tel"
                  value={form.phone}
                  maxLength={15}
                  placeholder="07XX XXX XXX"
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
                {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="nok-dob">Date of birth</Label>
                <Input
                  id="nok-dob"
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  value={form.date_of_birth}
                  onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                />
                {errors.date_of_birth && <p className="text-xs text-destructive">{errors.date_of_birth}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Relationship to you</Label>
                <Select
                  value={form.relationship}
                  onValueChange={(v) => setForm({ ...form, relationship: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select relationship" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    {RELATIONSHIPS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.relationship && <p className="text-xs text-destructive">{errors.relationship}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Gender</Label>
                <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
                {errors.gender && <p className="text-xs text-destructive">{errors.gender}</p>}
              </div>

              {form.relationship === "Other" && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="nok-other">Describe the relationship</Label>
                  <Input
                    id="nok-other"
                    maxLength={60}
                    value={form.relationship_other}
                    onChange={(e) => setForm({ ...form, relationship_other: e.target.value })}
                  />
                  {errors.relationship_other && (
                    <p className="text-xs text-destructive">{errors.relationship_other}</p>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="nok-ack"
                  checked={ack}
                  onCheckedChange={(v) => setAck(v === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="nok-ack" className="text-xs font-normal leading-relaxed">
                  {NEXT_OF_KIN_NOTICE}
                </Label>
              </div>
              {errors.ack && <p className="text-xs text-destructive">{errors.ack}</p>}
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={handleSubmitClick} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {record ? "Update Next of Kin" : "Save Next of Kin"}
              </Button>
              {record && (
                <Button variant="ghost" onClick={() => { setEditing(false); setErrors({}); }}>
                  Cancel
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm your next of kin</AlertDialogTitle>
            <AlertDialogDescription>
              Once saved, these details are locked for 3 months and cannot be changed before then.
              Please confirm that <span className="font-semibold text-foreground">{form.full_name}</span>{" "}
              is the person you nominate to receive your benefits from this welfare group.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Review again</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); save(); }} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm & Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
