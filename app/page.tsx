import { redirect } from "next/navigation"; import { getSession } from "@/lib/auth"; import { Dashboard } from "@/components/dashboard";
export default async function Page(){const session=await getSession();if(!session)redirect("/login");return <Dashboard username={session.username}/>}
