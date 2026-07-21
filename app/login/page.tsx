import { redirect } from "next/navigation"; import { getSession } from "@/lib/auth"; import { LoginForm } from "@/components/login-form";
export default async function LoginPage(){if(await getSession()) redirect("/");return <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4"><LoginForm/></main>}
