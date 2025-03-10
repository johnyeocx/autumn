import { createClient } from "@/utils/supabase/server";
import CursorDemo from "@/views/demo/CursorDemo";

import DynamicDemoView from "@/views/demo/DynamicDemo";
import MintDemoView from "@/views/demo/MintDemo";

export default async function DemoPage({ params }) {
  // console.log(params);
  const { slug } = await params;

  const sb = await createClient();
  const { data, error } = await sb
    .from("demo")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error) {
    return <div>Not Found...</div>;
  }

  if (params.slug == "cursor") {
    return (
      <CursorDemo
        publishableKey={data.publishable_key}
        secretKey={data.secret_key}
        name={data.name}
        buttons={data.buttons}
      />
    );
  }

  if (params.slug == "mint") {
    return (
      <MintDemoView
        publishableKey={data.publishable_key}
        secretKey={data.secret_key}
      />
    );
  }

  return (
    <DynamicDemoView
      publishableKey={data.publishable_key}
      secretKey={data.secret_key}
      slug={slug}
      name={data.name}
      buttons={data.buttons}
    />
  );
}
