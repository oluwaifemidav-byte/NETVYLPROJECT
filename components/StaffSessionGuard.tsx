'use client'

import {useEffect,useRef} from 'react'
import {useRouter} from 'next/navigation'
import {supabaseBrowser} from '../lib/supabase-browser'
import {getActiveOrganizationId} from '../lib/organization-context'

export default function StaffSessionGuard(){

  const router=useRouter()

  const supabaseRef=useRef(
    supabaseBrowser()
  )


  useEffect(()=>{

    let stopped=false

    let timer:
      ReturnType<typeof setInterval>|null=null


    const supabase=
      supabaseRef.current


    async function clearStaffSession(){

      try{
        await supabase.auth.signOut()
      }catch{}

      if(typeof window!=='undefined'){

        sessionStorage.removeItem(
          'netvyl_staff_id'
        )

        sessionStorage.removeItem(
          'netvyl_staff_name'
        )

        sessionStorage.removeItem(
          'netvyl_staff_role'
        )

        sessionStorage.removeItem(
          'netvyl_staff_organization_id'
        )

      }

    }


    async function checkStaffSession(){

      if(stopped){
        return
      }


      const {
        data:{
          user
        }
      }=await supabase.auth.getUser()


      if(!user){
        return
      }


      const staffRole=
        typeof window!=='undefined'
          ? sessionStorage.getItem(
              'netvyl_staff_role'
            )
          : null


      if(
        staffRole==='administrator'||
        staffRole==='super_admin'
      ){

        return
      }


      const staffId=
        typeof window!=='undefined'
          ? sessionStorage.getItem(
              'netvyl_staff_id'
            )
          : null


      /*
       * If this is not a staff session,
       * do nothing.
       */

      if(!staffId){
        return
      }


      const organizationId=
        typeof window!=='undefined'
          ? sessionStorage.getItem(
              'netvyl_staff_organization_id'
            )
          : null


      const activeOrganization=
        organizationId||
        getActiveOrganizationId()


      if(!activeOrganization){

        await clearStaffSession()

        if(!stopped){

          router.replace(
            '/login?reason=organization'
          )

        }

        return
      }


      /*
       * IMPORTANT TENANT ISOLATION
       *
       * Both user_id and organization_id
       * must match.
       */

      const {
        data:membership,
        error
      }=await supabase
        .from('organization_members')
        .select(
          'id,organization_id,active,role,staff_id,force_logout_at'
        )
        .eq(
          'user_id',
          user.id
        )
        .eq(
          'organization_id',
          activeOrganization
        )
        .maybeSingle()


      if(stopped){
        return
      }


      /*
       * Membership was deleted.
       */

      if(
        error||
        !membership
      ){

        await clearStaffSession()

        if(!stopped){

          router.replace(
            '/login?reason=removed'
          )

        }

        return
      }


      /*
       * Company mismatch.
       */

      if(
        membership.organization_id !==
        activeOrganization
      ){

        await clearStaffSession()

        if(!stopped){

          router.replace(
            '/login?reason=organization'
          )

        }

        return
      }


      /*
       * STAFF HAS BEEN SUSPENDED.
       */

      if(
        membership.active!==true
      ){

        await clearStaffSession()

        if(!stopped){

          router.replace(
            '/login?reason=suspended'
          )

        }

        return
      }


      /*
       * Only staff-level roles may remain
       * in a Staff Login session.
       */

      const allowedRoles=[
        'staff',
        'manager',
        'cashier',
        'production'
      ]


      const currentRole=
        String(
          membership.role||''
        ).toLowerCase()


      if(
        !allowedRoles.includes(
          currentRole
        )
      ){

        await clearStaffSession()

        if(!stopped){

          router.replace(
            '/login?reason=role'
          )

        }

        return
      }


      /*
       * Keep the verified company information
       * synchronized.
       */

      if(
        typeof window!=='undefined'
      ){

        sessionStorage.setItem(
          'netvyl_staff_role',
          currentRole
        )

        sessionStorage.setItem(
          'netvyl_staff_organization_id',
          membership.organization_id
        )

      }

    }


    /*
     * Check immediately.
     */

    void checkStaffSession()


    /*
     * Check every 5 seconds.
     */

    timer=setInterval(
      ()=>{
        void checkStaffSession()
      },
      5000
    )


    /*
     * Check again whenever the user returns
     * to the browser tab.
     */

    const handleVisibility=()=>{

      if(
        document.visibilityState===
        'visible'
      ){

        void checkStaffSession()

      }

    }


    document.addEventListener(
      'visibilitychange',
      handleVisibility
    )


    return ()=>{

      stopped=true

      if(timer){
        clearInterval(timer)
      }

      document.removeEventListener(
        'visibilitychange',
        handleVisibility
      )

    }

  },[router])


  return null
}