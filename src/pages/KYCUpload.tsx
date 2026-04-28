import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Upload, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { compressImage, formatFileSize } from "@/utils/imageCompression";

const KYCUpload = () => {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState<string>("");
  const [backPreview, setBackPreview] = useState<string>("");

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    side: 'front' | 'back'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error("Please upload an image file");
      return;
    }

    try {
      const compressed = await compressImage(file);
      if (file.size !== compressed.size) {
        toast.success(`Image optimized: ${formatFileSize(file.size)} → ${formatFileSize(compressed.size)}`);
      }
      if (side === 'front') {
        setFrontFile(compressed);
        setFrontPreview(URL.createObjectURL(compressed));
      } else {
        setBackFile(compressed);
        setBackPreview(URL.createObjectURL(compressed));
      }
    } catch {
      toast.error("Failed to process image");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast.error("You must be logged in");
      return;
    }

    if (!frontFile || !backFile) {
      toast.error("Please upload both front and back of your ID");
      return;
    }

    setUploading(true);

    try {
      // Upload front ID
      const frontPath = `${user.id}/id-front-${Date.now()}.${frontFile.name.split('.').pop()}`;
      const { error: frontError } = await supabase.storage
        .from('id-documents')
        .upload(frontPath, frontFile);

      if (frontError) throw frontError;

      // Upload back ID
      const backPath = `${user.id}/id-back-${Date.now()}.${backFile.name.split('.').pop()}`;
      const { error: backError } = await supabase.storage
        .from('id-documents')
        .upload(backPath, backFile);

      if (backError) throw backError;

      // Get public URLs
      const { data: frontUrl } = supabase.storage
        .from('id-documents')
        .getPublicUrl(frontPath);

      const { data: backUrl } = supabase.storage
        .from('id-documents')
        .getPublicUrl(backPath);

      // Update profile with KYC submission
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          id_front_url: frontUrl.publicUrl,
          id_back_url: backUrl.publicUrl,
          kyc_submitted_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (updateError) throw updateError;

      toast.success("KYC documents submitted successfully!");
      refreshProfile();
      navigate("/home");
    } catch (error: any) {
      console.error('Error uploading KYC:', error);
      toast.error(error.message || "Failed to upload documents");
    } finally {
      setUploading(false);
    }
  };

  // Redirect if already submitted
  if (profile?.kyc_submitted_at) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
            <h2 className="text-2xl font-bold">KYC Already Submitted</h2>
            <p className="text-muted-foreground">
              Your documents are under review. Status: <span className="font-semibold">{profile.kyc_status}</span>
            </p>
            <Button onClick={() => navigate("/home")} className="w-full">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full">
        <CardHeader>
          <CardTitle>Identity Verification (KYC)</CardTitle>
          <CardDescription>
            Upload clear photos of your ID document (front and back) for verification
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Front ID Upload */}
            <div className="space-y-2">
              <Label htmlFor="id-front">ID Front Side</Label>
              <div className="border-2 border-dashed rounded-lg p-6 text-center">
                {frontPreview ? (
                  <div className="space-y-2">
                    <img
                      src={frontPreview}
                      alt="ID Front"
                      className="max-h-48 mx-auto rounded"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setFrontFile(null);
                        setFrontPreview("");
                      }}
                    >
                      Change Image
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                    <Label
                      htmlFor="id-front"
                      className="cursor-pointer text-primary hover:underline"
                    >
                      Click to upload or drag and drop
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      PNG, JPG up to 5MB
                    </p>
                  </div>
                )}
                <Input
                  id="id-front"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileChange(e, 'front')}
                />
              </div>
            </div>

            {/* Back ID Upload */}
            <div className="space-y-2">
              <Label htmlFor="id-back">ID Back Side</Label>
              <div className="border-2 border-dashed rounded-lg p-6 text-center">
                {backPreview ? (
                  <div className="space-y-2">
                    <img
                      src={backPreview}
                      alt="ID Back"
                      className="max-h-48 mx-auto rounded"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setBackFile(null);
                        setBackPreview("");
                      }}
                    >
                      Change Image
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                    <Label
                      htmlFor="id-back"
                      className="cursor-pointer text-primary hover:underline"
                    >
                      Click to upload or drag and drop
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      PNG, JPG up to 5MB
                    </p>
                  </div>
                )}
                <Input
                  id="id-back"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileChange(e, 'back')}
                />
              </div>
            </div>

            <div className="bg-muted/50 p-4 rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Important:</strong> Make sure your ID is clearly visible, not blurred, 
                and all text is readable. Your submission will be reviewed by our admin team.
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => navigate("/home")}
                disabled={uploading}
              >
                Skip for Now
              </Button>
              <Button
                type="submit"
                variant="hero"
                className="flex-1"
                disabled={uploading || !frontFile || !backFile}
              >
                {uploading ? "Uploading..." : "Submit for Verification"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default KYCUpload;
