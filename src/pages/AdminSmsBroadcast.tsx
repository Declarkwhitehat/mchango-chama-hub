import { useState } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Send, Users, AlertTriangle, Shield, Lock, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
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

const ADMIN_PRIVILEGE_CODE = "D3E9C0L1A3R9K";

const SEGMENTS: { value: string; label: string; description: string }[] = [
  { value: "all_users", label: "All registered users", description: "Every profile with a phone number." },
  { value: "kyc_approved", label: "Users with valid KYC", description: "Profiles where KYC is approved." },
  { value: "kyc_missing", label: "Users without KYC", description: "Profiles with no KYC, pending or rejected." },
  { value: "chama_creators", label: "Chama creators", description: "Anyone who created a chama." },
  { value: "chama_members", label: "Chama members (approved)", description: "All active approved chama members." },
  { value: "welfare_creators", label: "Welfare creators", description: "Anyone who created a welfare." },
  { value: "welfare_members", label: "Welfare members (active)", description: "All active welfare members." },
  { value: "mchango_creators", label: "Campaign (Mchango) creators", description: "Anyone who created a mchango." },
  { value: "mchango_donors", label: "Campaign donors", description: "Anyone with a completed mchango donation." },
  { value: "top_trust", label: "Top members (trust score ≥ 80)", description: "High-trust active members." },
];

const TAGLINE = "sisi tuko pamoja, je wewe?";

const invokeSmsBroadcast = async (body: Record<string, unknown>) => {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Please sign in again before sending SMS.");

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-sms-broadcast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ...body, privilege_code: ADMIN_PRIVILEGE_CODE }),
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok || data?.error) throw new Error(data?.details || data?.error || text || `SMS request failed (${res.status})`);
  return data;
};

export default function AdminSmsBroadcast() {
  // Privilege-code gate (matches AdminPaybillBalance / AdminCommissionAnalytics pattern)
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [code, setCode] = useState("");
  const [unlockError, setUnlockError] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [showCode, setShowCode] = useState(false);

  const [segment, setSegment] = useState<string>("all_users");
  const [message, setMessage] = useState("");
  const [appendTagline, setAppendTagline] = useState(true);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastResult, setLastResult] = useState<{ sent: number; failed: number; total: number } | null>(null);

  const segmentMeta = SEGMENTS.find((s) => s.value === segment);
  const previewMessage = appendTagline && !message.toLowerCase().includes("sisi tuko pamoja")
    ? `${message}\n${TAGLINE}`
    : message;
  const charCount = previewMessage.length;
  const smsParts = Math.max(1, Math.ceil(charCount / 160));

  const handleUnlock = () => {
    if (code === ADMIN_PRIVILEGE_CODE) {
      setIsUnlocked(true);
      setUnlockError(false);
    } else {
      setUnlockError(true);
      setAttempts((p) => p + 1);
      setCode("");
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    setPreviewCount(null);
    try {
      const data = await invokeSmsBroadcast({ segment, preview: true });
      setPreviewCount(data.recipient_count ?? 0);
    } catch (e: any) {
      toast({ title: "Preview failed", description: e.message, variant: "destructive" });
    } finally {
      setPreviewing(false);
    }
  };

  const handleSendClick = async () => {
    if (!message.trim() || message.trim().length < 3) {
      toast({ title: "Write a message first", variant: "destructive" });
      return;
    }
    if (previewCount === null) {
      await handlePreview();
    }
    setConfirmOpen(true);
  };

  const doSend = async () => {
    setConfirmOpen(false);
    setSending(true);
    setLastResult(null);
    try {
      const d = await invokeSmsBroadcast({ segment, message, appendTagline, preview: false });
      setLastResult({ sent: d.sent || 0, failed: d.failed || 0, total: d.recipient_count || 0 });
      toast({
        title: d.failed > 0 ? "Broadcast partially sent" : "Broadcast complete",
        description: d.warning || `Sent ${d.sent}/${d.recipient_count} (${d.failed} failed).`,
        variant: d.failed > 0 ? "destructive" : undefined,
      });
    } catch (e: any) {
      toast({ title: "Broadcast failed", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container max-w-lg mx-auto px-4 py-8">
          <Card className="border-2 border-destructive/30">
            <CardHeader className="text-center space-y-3">
              <div className="mx-auto h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <Shield className="h-8 w-8 text-destructive" />
              </div>
              <CardTitle className="text-2xl">SMS Broadcast</CardTitle>
              <CardDescription className="text-base">
                Bulk SMS sending is a sensitive operation. Enter the admin privilege code to continue.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type={showCode ? "text" : "password"}
                  placeholder="Enter privilege code"
                  value={code}
                  onChange={(e) => { setCode(e.target.value); setUnlockError(false); }}
                  onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
                  className={`pl-10 pr-10 ${unlockError ? "border-destructive" : ""}`}
                  disabled={attempts >= 5}
                />
                <button
                  type="button"
                  onClick={() => setShowCode(!showCode)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showCode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {unlockError && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Invalid privilege code. {5 - attempts} attempts remaining.</span>
                </div>
              )}
              {attempts >= 5 && (
                <div className="text-destructive text-sm text-center font-medium">
                  Too many failed attempts. Please contact the system administrator.
                </div>
              )}
              <Button onClick={handleUnlock} className="w-full" disabled={!code || attempts >= 5}>
                <Shield className="h-4 w-4 mr-2" />
                Unlock SMS Broadcast
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Send className="h-7 w-7" /> SMS Broadcast
          </h1>
          <p className="text-muted-foreground mt-1">
            Send a promotional or platform SMS via Onfon to a selected audience segment.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>1. Choose audience</CardTitle>
            <CardDescription>Pick who should receive this message.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={segment} onValueChange={(v) => { setSegment(v); setPreviewCount(null); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SEGMENTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {segmentMeta && (
              <p className="text-xs text-muted-foreground">{segmentMeta.description}</p>
            )}
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={handlePreview} disabled={previewing}>
                {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4 mr-1" />}
                {previewing ? "Counting..." : "Preview recipients"}
              </Button>
              {previewCount !== null && (
                <Badge variant="secondary" className="text-sm">
                  {previewCount.toLocaleString()} recipients
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Compose message</CardTitle>
            <CardDescription>Plain text only. Emojis are stripped automatically.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Habari! Karibu Pamoja Nova. Anza chama yako leo bure kabisa."
              rows={5}
              maxLength={480}
            />
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="tagline" className="flex items-center gap-2 cursor-pointer text-sm">
                <Switch id="tagline" checked={appendTagline} onCheckedChange={setAppendTagline} />
                Append "{TAGLINE}"
              </Label>
              <span className="text-xs text-muted-foreground">
                {charCount} chars · {smsParts} SMS part{smsParts > 1 ? "s" : ""}
              </span>
            </div>
            {previewMessage && (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                {previewMessage}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Send</CardTitle>
            <CardDescription>You'll see a confirmation with recipient count before sending.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleSendClick} disabled={sending || !message.trim()} className="w-full gap-2">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? "Sending..." : "Send Broadcast"}
            </Button>
            {lastResult && (
              <div className="rounded-lg border p-3 text-sm">
                Last broadcast: <strong>{lastResult.sent}</strong> sent,{" "}
                <strong>{lastResult.failed}</strong> failed, of{" "}
                <strong>{lastResult.total}</strong> recipients.
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" /> Confirm SMS broadcast
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  You are about to send an SMS to{" "}
                  <strong>{previewCount ?? "?"}</strong> recipient(s) in segment{" "}
                  <strong>{segmentMeta?.label}</strong>.
                </p>
                <p>This will deduct Onfon SMS credits. There is no undo.</p>
                <div className="rounded border bg-muted/40 p-2 text-xs whitespace-pre-wrap">
                  {previewMessage}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doSend}>Send Now</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
