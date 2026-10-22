// Decides "not found" before the loading skeleton streams, so an unknown product id is a real 404.
import { notFound } from "next/navigation";
import { ObjectId } from "mongodb";

import { gateStaffPage, getIdentity } from "@/lib/auth/server";
import { PRODUCTS } from "@/lib/modules/catalogue/schema";

export default async function ProductEditLayout({ children, params }: LayoutProps<"/admin/products/[id]">) {
  const { id } = await params;
  await gateStaffPage("/admin/products", `/admin/products/${id}`);
  if (!/^[a-f0-9]{24}$/.test(id)) notFound();
  const identity = await getIdentity();
  if (identity.ok && !(await identity.identity.db.collection(PRODUCTS).findOne({ _id: new ObjectId(id) }, { projection: { _id: 1 } }))) notFound();
  return children;
}
