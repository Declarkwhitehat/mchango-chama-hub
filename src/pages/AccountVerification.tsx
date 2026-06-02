import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { BadgeCheck, Camera, Loader2, CheckCircle2, Clock, XCircle, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Capacitor } from "@capacitor/core";
import { Camera as CapCamera, CameraResultType, CameraSource } from "@capacitor/camera";
import { compressImage } from "@/utils/imageCompression";

const AccountVerification = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<any>(null);
  const [request, setRequest] = useState<any>(null);
  const [fee, setFee] = useState<number>(1500);
  const [phone, setPhone] = useState("");
  const [selfie, setSelfie] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: prof }, { data: req }, { data: feeRow }] = await Promise.all([
        supabase.from("profiles").select("is_verified,verified_at,phone,full_name").eq("id", user.id).maybeSingle(),
        supabase.from("user_verification_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("platform_settings").select("setting_value").eq("setting_key", "user_verification_fee").maybeSingle(),
      ]);
      setProfile(prof);
      setRequest(req);
      setPhone(prof?.phone || "");
      const amt = (feeRow?.setting_value as any)?.amount;
      if (typeof amt === "number") setFee(amt);
      setLoading(false);
    })();
  }, [user]);

  const onFile = (f: File | null) => {
    setSelfie(f);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  };

  const takeNativeSelfie = async () => {
    try {
      const photo = await CapCamera.getPhoto({
        quality: 70,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        direction: 'FRONT' as any,
        saveToGallery: false,
      });
      const b64 = photo.base64String;
      if (!b64) throw new Error("No image captured");
      const mime = `image/${photo.format || 'jpeg'}`;
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const file = new File([bytes], `selfie.${photo.format || 'jpg'}`, { type: mime });
      onFile(file);
    } catch (e: any) {
      if (e?.message && !/cancel/i.test(e.message)) {
        toast({ title: "Camera error", description: e.message, variant: "destructive" });
      }
    }
  };

  const handleTakeSelfie = () => {
    if (Capacitor.isNativePlatform()) {
      takeNativeSelfie();
    } else {
      fileRef.current?.click();
    }
  };

  const pollPaymentStatus = async (reqId: string) => {
    // Poll for up to ~75s (15 tries × 5s) for callback to flip payment_status
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const { data: row } = await supabase
        .from("user_verification_requests")
        .select("*")
        .eq("id", reqId)
        .maybeSingle();
      if (!row) continue;
      setRequest(row);
      if (row.payment_status === "paid") {
        toast({ title: "Payment confirmed", description: "Your verification is now under review." });
        return;
      }
      if (row.payment_status === "failed") {
        toast({
          title: "Payment failed",
          description: "STK push was not completed (insufficient funds, cancelled, or timed out). Please try again.",
          variant: "destructive",
        });
        return;
      }
    }
    toast({
      title: "Still waiting for payment",
      description: "We haven't received confirmation yet. If you completed the payment, refresh this page shortly.",
    });
  };

  const submit = async () => {
    if (!user) return;
    if (!selfie) { toast({ title: "Selfie required", variant: "destructive" }); return; }
    if (!phone) { toast({ title: "Phone required", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      // Always refetch the latest fee right before charging so admin edits take effect immediately
      const { data: feeRow } = await supabase
        .from("platform_settings")
        .select("setting_value")
        .eq("setting_key", "user_verification_fee")
        .maybeSingle();
      const liveAmt = (feeRow?.setting_value as any)?.amount;
      if (typeof liveAmt === "number") setFee(liveAmt);

      // Compress selfie before upload — original quality 100 photos can be 5-10MB and take 30+s to upload
      let toUpload: File = selfie;
      try {
        toUpload = await compressImage(selfie, { maxBytes: 300 * 1024 });
      } catch (e) {
        console.warn("Selfie compression failed, uploading original", e);
      }

      const ext = (toUpload.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("verification-selfies")
        .upload(path, toUpload, { upsert: true, contentType: toUpload.type || "image/jpeg" });
      if (upErr) throw upErr;

      const { data, error } = await supabase.functions.invoke("request-account-verification", {
        body: { selfie_path: path, phone_number: phone },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message || "Failed");

      const charged = (data as any)?.fee_amount ?? liveAmt ?? fee;
      setFee(charged);
      const reqId = (data as any)?.request_id;
      toast({
        title: "STK Push sent",
        description: `Enter your M-Pesa PIN to pay KES ${charged}. Awaiting confirmation…`,
      });
      // refresh request and start polling for the payment callback
      const { data: req } = await supabase
        .from("user_verification_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setRequest(req);
      if (reqId) pollPaymentStatus(reqId);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  const isVerified = profile?.is_verified;
  const pendingPaid = request && request.status === "pending" && request.payment_status === "paid";
  const pendingUnpaid = request && request.status === "pending" && request.payment_status !== "paid";
  const rejected = request?.status === "rejected";

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><BadgeCheck className="h-7 w-7 text-blue-500" /> Account Verification</h1>
          <p className="text-muted-foreground mt-1">Verified accounts get a blue badge and any chama, welfare, organization or campaign they create is auto-verified for free.</p>
        </div>

        {isVerified && (
          <Card className="border-blue-300 bg-blue-50/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-blue-600" /> Your account is verified</CardTitle>
              <CardDescription>All your existing and future groups & campaigns are auto-verified.</CardDescription>
            </CardHeader>
          </Card>
        )}

        {!isVerified && pendingPaid && (
          <Card className="border-amber-300 bg-amber-50/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-amber-600" /> Under Review</CardTitle>
              <CardDescription>Payment received. An admin is reviewing your selfie. You'll be notified once approved.</CardDescription>
            </CardHeader>
          </Card>
        )}

        {!isVerified && rejected && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><XCircle className="h-5 w-5 text-destructive" /> Previous request rejected</CardTitle>
              <CardDescription>{request.rejection_reason || "Please re-submit with a clearer selfie."}</CardDescription>
            </CardHeader>
          </Card>
        )}

        {!isVerified && !pendingPaid && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Get Verified</CardTitle>
              <CardDescription>Take a clear selfie and pay KES {fee.toLocaleString()} via M-Pesa STK push.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Selfie</Label>
                <input ref={fileRef} type="file" accept="image/*" capture="user" hidden
                  onChange={(e) => onFile(e.target.files?.[0] || null)} />
                <div className="mt-2 flex items-center gap-3">
                  <Button type="button" variant="outline" onClick={handleTakeSelfie} className="gap-2">
                    <Camera className="h-4 w-4" /> {selfie ? "Retake" : "Take selfie"}
                  </Button>
                  {previewUrl && <img src={previewUrl} alt="selfie preview" className="h-16 w-16 rounded-full object-cover border" />}
                </div>
              </div>
              <div>
                <Label htmlFor="phone">M-Pesa Phone</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XX XXX XXX" />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/40">
                <span className="text-sm">Verification Fee</span>
                <Badge variant="secondary">KES {fee.toLocaleString()}</Badge>
              </div>
              <Button onClick={submit} disabled={submitting} className="w-full gap-2">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                Pay & Submit
              </Button>
              {pendingUnpaid && (
                <p className="text-xs text-muted-foreground text-center">You can resubmit if the previous STK push was not completed.</p>
              )}
            </CardContent>
          </Card>
        )}

        <Button variant="ghost" onClick={() => navigate(-1)}>Back</Button>
      </main>
    </div>
  );
};

export default AccountVerification;
