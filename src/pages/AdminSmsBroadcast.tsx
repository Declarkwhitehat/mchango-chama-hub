import { useState } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Send, Users, AlertTriangle } from "lucide-react";
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

export default function AdminSmsBroadcast() {
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

  const handlePreview = async () => {
    setPreviewing(true);
    setPreviewCount(null);
    try {
      const { data, error } = await supabase.functions.invoke("admin-sms-broadcast", {
        body: { segment, preview: true },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      setPreviewCount((data as any).recipient_count ?? 0);
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
      const { data, error } = await supabase.functions.invoke("admin-sms-broadcast", {
        body: { segment, message, appendTagline, preview: false },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      const d = data as any;
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
