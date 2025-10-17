import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import Layout from "../components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const ChamaDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const [chama, setChama] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load chama details
  useEffect(() => {
    const fetchChama = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error } = await supabase.functions.invoke("chama-crud", {
          body: { action: "get_chama", slug },
        });

        if (error) throw error;
        if (!data?.data) throw new Error("Chama details not found");

        setChama(data.data);
      } catch (err: any) {
        console.error("Error loading chama details:", err);
        setError(err.message || "Failed to load chama details");
      } finally {
        setLoading(false);
      }
    };

    if (slug) fetchChama();
  }, [slug]);

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-10 text-gray-500">Loading chama details...</div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="text-center py-10 text-red-500">⚠️ {error}</div>
      </Layout>
    );
  }

  if (!chama) {
    return (
      <Layout>
        <div className="text-center py-10 text-gray-500">Chama not found.</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto mt-8 space-y-6">
        <Card>
          <CardContent className="space-y-3">
            <h2 className="text-xl font-semibold">{chama.name}</h2>
            <p>{chama.description}</p>
            <Badge variant="secondary">{chama.category}</Badge>
            <div className="text-sm text-gray-500">
              Created on {new Date(chama.created_at).toLocaleDateString()}
            </div>
          </CardContent>
        </Card>

        <div>
          <h3 className="font-semibold mb-3">Members</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {chama.chama_members?.length ? (
              chama.chama_members.map((m: any, i: number) => (
                <Card key={i}>
                  <CardContent className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">{m.full_name}</p>
                      <p className="text-sm text-gray-500">{m.email}</p>
                    </div>
                    <div>
                      {m.is_manager && (
                        <Badge variant="secondary">Manager</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div>No members yet.</div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ChamaDetail;
